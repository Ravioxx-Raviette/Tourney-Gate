from werkzeug.security import generate_password_hash
from db import get_db,transaction,now
from test_booking import reserve,confirm,seat_payload


def tier_payload(capacity=20,**extra):
    return {'name':'Royal Box','kind':'seated','price':'1500.00','capacity':capacity,'max_per_order':8,'perks':'A grand view',**extra}


def test_admin_authentication_and_csrf(app,browser,admin):
    client,headers=browser
    assert client.get('/admin').status_code==403
    assert client.get('/api/admin/overview').status_code==403
    assert client.post('/api/admin/events/1/cancel',json={},headers=headers).status_code==403
    # Password-only legacy sessions cannot bypass database-backed roles.
    with client.session_transaction() as state:state['admin']=True
    assert client.get('/admin').status_code==403
    assert client.get('/admin/login').location.endswith('/login?next=/admin')
    organizer,auth=admin
    assert organizer.get('/admin').status_code==200
    assert organizer.post('/api/admin/events/1/cancel',json={}).status_code==403


def test_capacity_respects_sold_and_held_and_historical_seats(app,browser,admin):
    client,headers=browser
    organizer,auth=admin
    booking=reserve(client,headers,payload=seat_payload(app,2)).json
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(1),headers=auth).status_code==409
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(2),headers=auth).status_code==200
    confirm(client,headers,booking)
    client.post(f"/api/bookings/{booking['id']}/cancel",json={},headers=headers)
    # Retiring old seat positions preserves historical ticket references.
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(0),headers=auth).status_code==200
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(25),headers=auth).status_code==200
    with app.app_context():
        db=get_db()
        assert db.execute("SELECT COUNT(*) FROM seats WHERE tier_id=1 AND status='available'").fetchone()[0]==25
        assert db.execute('SELECT remaining FROM ticket_tiers WHERE id=1').fetchone()[0]==25
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]


def test_event_cancellation_cancels_holds_and_confirmed_bookings(app,browser,admin):
    client,headers=browser
    organizer,auth=admin
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirm(client,headers,booking)
    pending=reserve(client,headers,payload={'items':[{'tier_id':1,'seat_ids':[2]}]}).json
    result=organizer.post('/api/admin/events/1/cancel',json={},headers=auth)
    assert result.status_code==200
    assert result.json['status']=='cancelled'
    assert result.json['tiers'][0]['remaining']==20
    assert client.get(f"/api/reservations/{pending['id']}").json['status']=='cancelled'
    assert confirm(client,headers,pending).status_code==409
    assert reserve(client,headers,payload=seat_payload(app)).status_code==409
    assert organizer.post('/api/admin/events/1/cancel',json={},headers=auth).json['tiers'][0]['remaining']==20


def test_create_edit_events_tiers_and_sales_snapshot(app,browser,admin):
    organizer,auth=admin
    values={'title':'A New Gathering','slug':'new-gathering','category':'Feast','venue_id':4,'description':'A fictional feast.','image':'feast','start_at':'2027-05-01T18:00','end_at':'2027-05-01T22:00','schedule':[['Gates open','17:30']]}
    response=organizer.post('/api/admin/events',json=values,headers=auth)
    assert response.status_code==201
    event_id=response.json['id']
    assert organizer.post('/api/admin/events',json=values,headers=auth).status_code==400
    values['title']='A Grander Gathering'
    assert organizer.put(f'/api/admin/events/{event_id}',json=values,headers=auth).status_code==200
    added=organizer.post(f'/api/admin/events/{event_id}/tiers',json=tier_payload(16,name='Feast seat'),headers=auth)
    assert added.status_code==200
    assert added.json['status']=='upcoming'
    seats=organizer.get(f'/api/events/{event_id}/availability').json['seats']
    assert len(seats)==16
    assert len(set(s['row'] for s in seats))==2
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirm(client,headers,booking)
    organizer.put('/api/admin/tiers/1',json=tier_payload(price='2000'),headers=auth)
    overview=organizer.get('/api/admin/overview').json
    assert next(e['revenue'] for e in overview['events'] if e['id']==1)==150000


def test_capacity_change_and_unsafe_inputs(admin):
    organizer,auth=admin
    for values in [tier_payload(-1),tier_payload(price='NaN'),tier_payload(price='-1'),tier_payload(kind='counted')]:
        assert organizer.put('/api/admin/tiers/1',json=values,headers=auth).status_code in (400,409)


def test_seed_idempotent(app):
    from seed import seed_demo
    with app.app_context():
        assert seed_demo() is False
        assert get_db().execute('SELECT COUNT(*) FROM events').fetchone()[0]==5


def test_large_seating_capacity_uses_alphabetic_rows(admin):
    organizer,auth=admin
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(300),headers=auth).status_code==200
    assert organizer.put('/api/admin/tiers/1',json=tier_payload(310),headers=auth).status_code==200
    rows={seat['row'] for seat in organizer.get('/api/events/1/availability').json['seats'] if seat['tier_id']==1}
    assert {'Z','AA','AE'}<=rows


