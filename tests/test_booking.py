from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import re

import pytest
from conftest import client_with_csrf
from db import get_db, now, transaction

BUYER={'name':'Demo Guest','email':'guest@example.test','phone':'09123456789','simulated_payment':True}


def seat_payload(app,quantity=1):
    with app.app_context():
        seats=get_db().execute('SELECT id FROM seats WHERE tier_id=1 ORDER BY id LIMIT ?',(quantity,)).fetchall()
    return {'items':[{'tier_id':1,'seat_ids':[s['id'] for s in seats]}]}


def reserve(client,headers,event_id=1,payload=None):
    return client.post(f'/api/events/{event_id}/reservations',json=payload or {'items':[{'tier_id':7,'quantity':1}]},headers=headers)


def confirm(client,headers,booking):
    return client.post(f"/api/reservations/{booking['id']}/confirm",json=BUYER,headers=headers)


def test_full_flow_and_ticket_privacy(app,browser):
    client,headers=browser
    pending=reserve(client,headers,payload=seat_payload(app,2))
    assert pending.status_code==201
    booking=pending.json
    tier=next(t for t in booking['event']['tiers'] if t['id']==1)
    assert (tier['remaining'],tier['held'],tier['available'])==(20,2,18)
    assert 599<=booking['expires_at']-booking['server_time']<=600
    assert re.fullmatch(r'TG-[A-Z2-9]{6}',booking['reference_code'])
    assert client.get(f"/checkout/{booking['id']}").status_code==200
    result=confirm(client,headers,booking)
    assert result.status_code==200
    assert result.json['status']=='confirmed'
    assert result.json['event']['tiers'][0]['remaining']==18
    assert client.get(f"/ticket/{booking['reference_code']}").status_code==200
    stranger,other_headers=client_with_csrf(app)
    assert stranger.get(f"/ticket/{booking['reference_code']}").status_code==403
    assert stranger.post(f"/api/bookings/{booking['id']}/cancel",json={},headers=other_headers).status_code==403
    lookup=stranger.post('/api/bookings/lookup',json={'email':BUYER['email'],'reference':booking['reference_code'].lower()},headers=other_headers)
    assert lookup.status_code==404
    assert stranger.get(f"/ticket/{booking['reference_code']}").status_code==403


def test_confirmation_and_cancellation_are_idempotent(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    assert confirm(client,headers,booking).status_code==200
    assert confirm(client,headers,booking).json['event']['tiers'][0]['remaining']==19
    path=f"/api/bookings/{booking['id']}/cancel"
    assert client.post(path,json={},headers=headers).json['event']['tiers'][0]['remaining']==20
    assert client.post(path,json={},headers=headers).json['event']['tiers'][0]['remaining']==20
    with app.app_context():
        assert get_db().execute('SELECT status FROM seats WHERE id=1').fetchone()[0]=='available'


def test_expiry_releases_seats_and_blocks_confirm(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    with app.app_context(),transaction() as db:
        db.execute('UPDATE bookings SET expires_at=? WHERE id=?',(now()-1,booking['id']))
    state=client.get('/api/events/1/availability').json
    assert state['tiers'][0]['available']==20
    assert state['seats'][0]['status']=='available'
    assert confirm(client,headers,booking).status_code==409
    assert client.get(f"/api/reservations/{booking['id']}").json['status']=='expired'


def test_counted_holds_exclude_others_without_decrementing_remaining(app,browser):
    client,headers=browser
    with app.app_context(),transaction() as db:
        db.execute('UPDATE ticket_tiers SET capacity=1,remaining=1 WHERE id=7')
    booking=reserve(client,headers,event_id=2).json
    other,other_headers=client_with_csrf(app)
    assert reserve(other,other_headers,event_id=2).status_code==409
    tier=next(t for t in client.get('/api/events/2/availability').json['tiers'] if t['id']==7)
    assert (tier['remaining'],tier['available'])==(1,0)
    assert client.delete(f"/api/reservations/{booking['id']}",headers=headers).status_code==200
    assert reserve(other,other_headers,event_id=2).status_code==201


def test_concurrent_last_seat_has_one_winner(app):
    payload=seat_payload(app)
    clients=[client_with_csrf(app) for _ in range(2)]
    barrier=Barrier(2)
    def attempt(pair):
        barrier.wait()
        return reserve(*pair,payload=payload)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(attempt,clients))
    assert sorted(result.status_code for result in results)==[201,409]
    winner=next(i for i,result in enumerate(results) if result.status_code==201)
    with ThreadPoolExecutor(max_workers=2) as pool:
        duplicate=list(pool.map(lambda _:confirm(*clients[winner],results[winner].json).status_code,range(2)))
    assert duplicate==[200,200]
    with app.app_context():
        assert get_db().execute('SELECT remaining FROM ticket_tiers WHERE id=1').fetchone()[0]==19


def test_concurrent_last_counted_ticket_and_sold_out_recovery(app,browser):
    with app.app_context(),transaction() as db:
        db.execute("INSERT INTO ticket_tiers (event_id,name,kind,price,capacity,remaining) VALUES (5,'Last place','counted',10000,1,1)")
        tier_id=db.execute('SELECT MAX(id) FROM ticket_tiers').fetchone()[0]
    clients=[client_with_csrf(app) for _ in range(2)]
    barrier=Barrier(2)
    def attempt(pair):
        barrier.wait()
        response=reserve(*pair,event_id=5,payload={'items':[{'tier_id':tier_id,'quantity':1}]})
        if response.status_code==201:
            return confirm(*pair,response.json)
        return response
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(attempt,clients))
    assert sorted(r.status_code for r in results)==[200,409]
    winner=next(i for i,r in enumerate(results) if r.status_code==200)
    assert results[winner].json['event']['status']=='sold_out'
    response=clients[winner][0].post(f"/api/bookings/{results[winner].json['id']}/cancel",json={},headers=clients[winner][1])
    assert response.json['event']['status']=='upcoming'


def test_edits_preserve_expiry_and_failed_edits_preserve_original(app,browser):
    client,headers=browser
    payload=seat_payload(app)
    booking=reserve(client,headers,payload=payload).json
    edit=client.put(f"/api/reservations/{booking['id']}",json=seat_payload(app,2),headers=headers)
    assert edit.status_code==200
    assert edit.json['expires_at']==booking['expires_at']
    bad=client.put(f"/api/reservations/{booking['id']}",json={'items':[{'tier_id':1,'seat_ids':[999999]}]},headers=headers)
    assert bad.status_code==409
    preserved=client.get(f"/api/reservations/{booking['id']}").json
    assert len(preserved['items'])==2
    assert preserved['event']['tiers'][0]['held']==2


@pytest.mark.parametrize('payload',[
    {'items':[{'tier_id':1,'seat_ids':list(range(1,10))}]},
    {'items':[{'tier_id':1,'seat_ids':[1,1]}]},
    {'items':[{'tier_id':1,'seat_ids':[1]},{'tier_id':1,'seat_ids':[2]}]},
    {'items':[{'tier_id':1,'seat_ids':[True]}]},
    {'items':[{'tier_id':1,'seat_ids':[999999]}]},
    {'items':[{'tier_id':7,'quantity':1}]},
    {'items':[]},
    {'items':[{'tier_id':4,'quantity':1}]},
])
def test_invalid_and_cross_event_selections_are_rejected(app,browser,payload):
    client,headers=browser
    assert reserve(client,headers,payload=payload).status_code in (400,404,409)
    with app.app_context():
        assert get_db().execute("SELECT COUNT(*) FROM bookings WHERE status='pending'").fetchone()[0]==0


def test_aggregate_order_limit_across_tiers(app,browser):
    client,headers=browser
    with app.app_context():
        db=get_db()
        first=[r[0] for r in db.execute('SELECT id FROM seats WHERE tier_id=1 LIMIT 5')]
        second=[r[0] for r in db.execute('SELECT id FROM seats WHERE tier_id=2 LIMIT 4')]
    response=reserve(client,headers,payload={'items':[{'tier_id':1,'seat_ids':first},{'tier_id':2,'seat_ids':second}]})
    assert response.status_code==400


def test_participant_waiver_and_registration(app,browser):
    client,headers=browser
    data={'kind':'participant','items':[{'tier_id':4,'quantity':1}],'participant':{'legal_name':'Demo Guest','persona':'Lady Ember','faction':'House Dawn','class':'Knight','waiver':False}}
    assert reserve(client,headers,payload=data).status_code==400
    data['participant']['waiver']=True
    booking=reserve(client,headers,payload=data).json
    result=confirm(client,headers,booking)
    assert result.status_code==200
    participant=result.json['items'][0]
    assert participant['participant_legal_name']=='Demo Guest'
    assert participant['waiver_accepted_at']
    assert result.json['event']['tiers'][3]['remaining']==15


def test_price_snapshot_is_authoritative(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    with app.app_context(),transaction() as db:
        db.execute('UPDATE ticket_tiers SET price=200000 WHERE id=1')
    result=confirm(client,headers,booking).json
    assert result['total']==150000
    assert result['items'][0]['unit_price']==150000


def test_cancellation_window_and_past_sales(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirm(client,headers,booking)
    with app.app_context(),transaction() as db:
        db.execute('UPDATE events SET start_at=?,end_at=? WHERE id=1',(now()+3600,now()+7200))
    assert client.post(f"/api/bookings/{booking['id']}/cancel",json={},headers=headers).status_code==409
    with app.app_context(),transaction() as db:
        db.execute('UPDATE events SET start_at=?,end_at=? WHERE id=1',(now()-7200,now()-3600))
    assert reserve(client,headers,payload=seat_payload(app,2)).status_code==409


def test_validation_csrf_and_no_owner_leak(app,browser):
    client,headers=browser
    assert reserve(client,{},payload=seat_payload(app)).status_code==403
    booking=reserve(client,headers,payload=seat_payload(app)).json
    assert 'owner_token' not in booking
    for data in [{**BUYER,'email':'bad'},{**BUYER,'simulated_payment':False},{**BUYER,'phone':'abcdefg'}]:
        assert client.post(f"/api/reservations/{booking['id']}/confirm",json=data,headers=headers).status_code==400


def test_spectator_sold_out_with_participant_places_remaining(app,browser):
    client,headers=browser
    with app.app_context(),transaction() as db:
        db.execute("UPDATE ticket_tiers SET capacity=0,remaining=0 WHERE event_id=1 AND kind<>'participant'")
        db.execute("UPDATE seats SET status='retired' WHERE tier_id IN (1,2,3)")
    response=client.get('/api/events/1/availability').json
    assert response['status']=='upcoming'
    assert response['spectator_remaining']==0
    page=client.get('/events/silver-lance')
    assert page.status_code==200
    assert b'disabled>Sold out' in page.data


