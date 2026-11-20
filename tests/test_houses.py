from conftest import client_with_csrf
from test_booking import reserve, seat_payload, BUYER

HOUSE={'name':'House Ember','motto':'By courage, we rise.','crest':'stag','palette':'crimson'}

def save_house(client, headers, profile=HOUSE):
    return client.post('/house',data={**profile,'csrf_token':headers['X-CSRF-Token']})

def test_house_save_and_optional_clear(browser):
    client,headers=browser
    assert client.get('/house').status_code==200
    assert save_house(client,headers).status_code==302
    assert b'House Ember' in client.get('/').data
    assert client.post('/house/clear',data={'csrf_token':headers['X-CSRF-Token']}).status_code==302
    assert b'House Ember' not in client.get('/').data

def test_invalid_house_and_csrf_preserve_profile(browser):
    client,headers=browser
    assert save_house(client,headers).status_code==302
    assert save_house(client,headers,{**HOUSE,'palette':'red;display:none'}).status_code==400
    assert save_house(client,headers,{**HOUSE,'name':'x'*41}).status_code==400
    assert save_house(client,headers,{**HOUSE,'name':'\nHouse Ember\t'}).status_code==400
    assert client.post('/house',data=HOUSE).status_code==403
    assert b'House Ember' in client.get('/').data

def test_confirmed_ticket_snapshots_house_and_lookup(app,browser):
    client,headers=browser
    save_house(client,headers)
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirmed=client.post('/api/reservations/'+booking['id']+'/confirm',json=BUYER,headers=headers)
    assert confirmed.status_code==200
    assert confirmed.json['house']==HOUSE
    save_house(client,headers,{**HOUSE,'name':'House Dawn','crest':'raven'})
    repeated=client.post('/api/reservations/'+booking['id']+'/confirm',json={**BUYER,'include_house':True,'house_profile':HOUSE},headers=headers)
    assert repeated.status_code==200
    assert repeated.json['house']==HOUSE
    stranger,auth=client_with_csrf(app)
    assert stranger.get('/ticket/'+confirmed.json['reference_code']).status_code==403
    assert stranger.post('/api/bookings/lookup',json={'email':BUYER['email'],'reference':confirmed.json['reference_code']},headers=auth).status_code==200
    ticket=stranger.get('/ticket/'+confirmed.json['reference_code']).data
    assert b'House Ember' in ticket and b'House Dawn' not in ticket

def test_guest_can_opt_out_and_remain_unpersonalized(app,browser):
    client,headers=browser
    save_house(client,headers)
    booking=reserve(client,headers,payload=seat_payload(app)).json
    result=client.post('/api/reservations/'+booking['id']+'/confirm',json={**BUYER,'include_house':False},headers=headers)
    assert result.status_code==200 and result.json['house'] is None

def test_house_text_is_escaped(browser):
    client,headers=browser
    save_house(client,headers,{**HOUSE,'name':'<script>alert(1)</script>'})
    html=client.get('/house').get_data(as_text=True)
    assert '<script>alert(1)</script>' not in html
    assert '&lt;script&gt;' in html


def test_house_changed_in_another_tab_requires_checkout_review(app,browser):
    client,headers=browser
    save_house(client,headers)
    booking=reserve(client,headers,payload=seat_payload(app)).json
    save_house(client,headers,{**HOUSE,'name':'House Dawn'})
    response=client.post('/api/reservations/'+booking['id']+'/confirm',json={**BUYER,'include_house':True,'house_profile':HOUSE},headers=headers)
    assert response.status_code==409
    assert client.get('/api/reservations/'+booking['id']).json['status']=='pending'
