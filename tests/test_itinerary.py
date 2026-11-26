from itinerary import plan_days
from conftest import client_with_csrf
from db import transaction

def event(id,start,end,venue=1):
    return {'id':id,'title':str(id),'start_at':start,'end_at':end,'venue_id':venue,'starting_price':10000}

def test_nested_overlap_and_breaks():
    plan=plan_days([event(3,5000,6000),event(1,0,10000),event(2,2000,4000)])
    assert len([i for i in plan['issues'] if i['kind']=='overlap'])==2
    assert plan['total']==30000
    assert plan_days([event(1,0,3600),event(2,3600,7200,2)])['issues'][0]['kind']=='break'
    assert plan_days([event(1,0,3600),event(2,5400,7200,2)])['issues']==[]

def test_planner_is_optional_private_and_idempotent(app,browser):
    client,headers=browser
    assert client.get('/itinerary').status_code==200
    values={'event_id':'1','csrf_token':headers['X-CSRF-Token']}
    assert client.post('/itinerary/add',data=values).status_code==302
    assert client.post('/itinerary/add',data=values).status_code==302
    with client.session_transaction() as state:assert state['itinerary']==[1]
    stranger,_=client_with_csrf(app)
    assert 'No events planned yet' in stranger.get('/itinerary').get_data(as_text=True)
    with app.app_context(),transaction() as db:
        assert db.execute("SELECT COUNT(*) FROM bookings WHERE id<>'seed-sold-out'").fetchone()[0]==0
    assert client.post('/itinerary/remove',data=values).status_code==302
    assert 'No events planned yet' in client.get('/itinerary').get_data(as_text=True)

def test_csrf_invalid_ids_and_clear(browser):
    client,headers=browser
    assert client.post('/itinerary/add',data={'event_id':'1'}).status_code==403
    assert client.post('/itinerary/add',data={'event_id':'bad','csrf_token':headers['X-CSRF-Token']}).status_code==400
    assert client.post('/itinerary/add',data={'event_id':'99999','csrf_token':headers['X-CSRF-Token']}).status_code==404
    client.post('/itinerary/add',data={'event_id':'1','csrf_token':headers['X-CSRF-Token']})
    assert client.post('/itinerary/clear',data={'csrf_token':headers['X-CSRF-Token']}).status_code==302

def test_same_day_venue_transfer_warning_and_cancelled_event(app,browser):
    client,headers=browser
    for id in [3,4]:client.post('/itinerary/add',data={'event_id':str(id),'csrf_token':headers['X-CSRF-Token']})
    html=client.get('/itinerary').get_data(as_text=True)
    assert 'Allow 30 minutes' in html and 'The King’s Mark' in html and 'The Victor’s Feast' in html
    with app.app_context(),transaction() as db:db.execute("UPDATE events SET status='cancelled' WHERE id=3")
    assert 'Cancelled' in client.get('/itinerary').get_data(as_text=True)


def test_missing_saved_events_can_be_cleared(app,browser):
    client,headers=browser
    with client.session_transaction() as state:user_id=state['user_id']
    with app.app_context(),transaction() as db:db.execute("UPDATE account_profiles SET itinerary_json='[99999]' WHERE user_id=?",(user_id,))
    html=client.get('/itinerary').get_data(as_text=True)
    assert 'no longer listed' in html and 'Clear all saved events' in html
    client.post('/itinerary/clear',data={'csrf_token':headers['X-CSRF-Token']})
    with client.session_transaction() as state:assert state['itinerary']==[]
