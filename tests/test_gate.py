from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from test_booking import reserve, seat_payload, confirm
from conftest import client_with_csrf
from db import transaction,now

def ticket(app,browser):
    client,headers=browser
    pending=reserve(client,headers,payload=seat_payload(app,2)).json
    result=confirm(client,headers,pending)
    assert result.status_code==200
    return result.json

def test_qr_is_private_and_stable(app,browser):
    client,_=browser;b=ticket(app,browser)
    first=client.get('/ticket/'+b['reference_code']+'/qr.svg')
    assert first.status_code==200 and first.mimetype=='image/svg+xml'
    assert b'<svg' in first.data
    assert first.data==client.get('/ticket/'+b['reference_code']+'/qr.svg').data
    stranger,_=client_with_csrf(app)
    assert stranger.get('/ticket/'+b['reference_code']+'/qr.svg').status_code==403

def test_gate_auth_csrf_review_and_group_checkin(app,browser,admin):
    client,headers=browser;b=ticket(app,browser);staff,auth=admin
    data={'event_id':1,'code':b['reference_code']}
    assert client.post('/api/admin/gate/inspect',json=data,headers=headers).status_code==403
    assert staff.post('/api/admin/gate/check-in',json=data).status_code==403
    view=staff.post('/api/admin/gate/inspect',json=data,headers=auth).json
    assert view['status']=='valid' and view['count']==2
    assert staff.post('/api/admin/gate/inspect',json=data,headers=auth).json['status']=='valid'
    assert staff.post('/api/admin/gate/check-in',json=data,headers=auth).json['status']=='admitted'
    assert staff.post('/api/admin/gate/check-in',json=data,headers=auth).json['status']=='used'
    assert client.post('/api/bookings/'+b['id']+'/cancel',json={},headers=headers).status_code==409

def test_wrong_event_cancelled_unknown_and_expired(app,browser,admin):
    client,headers=browser;b=ticket(app,browser);staff,auth=admin
    def inspect(event_id,code):return staff.post('/api/admin/gate/inspect',json={'event_id':event_id,'code':code},headers=auth).json
    assert inspect(2,b['reference_code'])['status']=='wrong_event'
    assert inspect(1,'TG-UNKNOWN')['status']=='not_found'
    client.post('/api/bookings/'+b['id']+'/cancel',json={},headers=headers)
    assert inspect(1,b['reference_code'])['status']=='cancelled'
    with app.app_context(),transaction() as db:db.execute('UPDATE events SET end_at=?,start_at=? WHERE id=1',(now()-1,now()-3600))
    assert inspect(1,b['reference_code'])['status']=='closed'

def test_atomic_concurrent_checkin(app,browser):
    b=ticket(app,browser)
    staff=[client_with_csrf(app,role='admin') for _ in range(2)]
    barrier=Barrier(2)
    def check(pair):
        c,headers=pair;barrier.wait()
        return c.post('/api/admin/gate/check-in',json={'event_id':1,'code':b['reference_code']},headers=headers).json['status']
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(check,staff))==['admitted','used']


def test_qr_payload_and_revalidation_before_admission(app,browser,admin):
    client,headers=browser;b=ticket(app,browser);staff,auth=admin
    with app.app_context(),transaction() as db:
        token=db.execute('SELECT token FROM gate_passes WHERE booking_id=?',(b['id'],)).fetchone()['token']
    data={'event_id':1,'code':'TG1:'+token}
    assert staff.post('/api/admin/gate/inspect',json=data,headers=auth).json['status']=='valid'
    assert client.post('/api/bookings/'+b['id']+'/cancel',json={},headers=headers).status_code==200
    assert staff.post('/api/admin/gate/check-in',json=data,headers=auth).json['status']=='cancelled'
    assert client.get('/ticket/'+b['reference_code']+'/qr.svg').status_code==409


def test_pending_and_expired_passes_cannot_enter(app,browser,admin):
    client,headers=browser;staff,auth=admin
    b=reserve(client,headers,payload=seat_payload(app,2)).json
    data={'event_id':1,'code':b['reference_code']}
    assert staff.post('/api/admin/gate/check-in',json=data,headers=auth).json['status']=='pending'
    with app.app_context(),transaction() as db:
        db.execute('UPDATE bookings SET expires_at=? WHERE id=?',(now()-1,b['id']))
    assert staff.post('/api/admin/gate/check-in',json=data,headers=auth).json['status']=='expired'
