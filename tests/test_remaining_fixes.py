"""Account cleanup preserves ownership, legacy tickets, and booking rules."""
import json
import re
from urllib.parse import parse_qs, urlsplit

import pytest
from werkzeug.security import generate_password_hash
from db import get_db, transaction, now
from conftest import client_with_csrf
from test_accounts import anonymous, register, login, csrf
from test_booking import reserve, confirm, seat_payload


@pytest.mark.parametrize('length,expected', [(11,400),(12,302),(64,302),(65,400)])
def test_registration_password_boundaries(app,length,expected):
    client,_=anonymous(app)
    password='p'*length
    assert register(client,password=password,password_confirm=password).status_code==expected


def test_new_password_inputs_and_legacy_login(app):
    client,_=anonymous(app)
    html=client.get('/register').get_data(as_text=True)
    assert html.count('maxlength="64"')==2 and 'Use 12–64 characters.' in html
    assert 'maxlength="128"' in client.get('/login').get_data(as_text=True)
    register(client)
    legacy='legacy-passphrase-'+'x'*80
    with app.app_context(),transaction() as db:
        db.execute('UPDATE users SET password_hash=?',(generate_password_hash(legacy),))
    client.post('/logout',data={'csrf_token':csrf(client)['X-CSRF-Token']})
    assert login(client,password=legacy).status_code==302
    assert client.get('/account').status_code==200


def test_cli_provisioning_and_reset_share_new_bounds(app):
    runner=app.test_cli_runner()
    oversized='x'*65
    result=runner.invoke(args=['create-admin','--email','admin@example.test'],input=oversized+'\n'+oversized+'\n')
    assert result.exit_code!=0 and '12 and 64' in result.output
    valid='y'*64
    assert runner.invoke(args=['create-admin','--email','admin@example.test'],input=valid+'\n'+valid+'\n').exit_code==0
    result=runner.invoke(args=['reset-password','--email','admin@example.test'],input=oversized+'\n'+oversized+'\n')
    assert result.exit_code!=0 and '12 and 64' in result.output
    assert runner.invoke(args=['reset-password','--email','admin@example.test'],input='z'*12+'\n'+'z'*12+'\n').exit_code==0


@pytest.mark.parametrize('count',[0,1,3,4])
def test_account_preview_is_chronological_limited_and_ignores_deleted_events(app,count):
    client,_=client_with_csrf(app)
    with client.session_transaction() as state:uid=state['user_id']
    with app.app_context(),transaction() as db:
        rows=db.execute('SELECT id,title FROM events ORDER BY start_at,id LIMIT 4').fetchall()
        selected=rows[:count]
        db.execute('UPDATE account_profiles SET itinerary_json=? WHERE user_id=?',
                   (json.dumps([row['id'] for row in reversed(selected)]+[999999]),uid))
    html=client.get('/account').get_data(as_text=True)
    card=html.split('class="panel account-itinerary">',1)[1].split('</section>',1)[0]
    assert card.count('<li>')==min(count,3)
    assert 'href="/itinerary">Plan My Day</a>' in card
    if count:
        assert f'{count} saved event' in card and 'PHT' in card
        titles=[row['title'] for row in selected[:3]]
        assert [card.index(title) for title in titles]==sorted(card.index(title) for title in titles)
        if count>3:assert '+1 more saved event.' in card
    else:assert 'No saved events yet.' in card


def test_itinerary_preview_identifies_cancelled_and_ended_events(app):
    client,_=client_with_csrf(app)
    with client.session_transaction() as state:uid=state['user_id']
    with app.app_context(),transaction() as db:
        db.execute("UPDATE events SET status='cancelled' WHERE id=1")
        db.execute('UPDATE events SET start_at=?,end_at=? WHERE id=2',(now()-7200,now()-3600))
        db.execute('UPDATE account_profiles SET itinerary_json=? WHERE user_id=?',(json.dumps([1,2]),uid))
    card=client.get('/account').get_data(as_text=True).split('class="panel account-itinerary">',1)[1]
    assert '>Cancelled</span>' in card and '>Ended</span>' in card


def test_old_bookings_links_redirect_and_lookup_is_unavailable(app):
    guest,headers=anonymous(app)
    location=urlsplit(guest.get('/bookings').location)
    assert location.path=='/login' and parse_qs(location.query)['next']==['/account#bookings']
    assert guest.post('/api/bookings/lookup',json={},headers=headers).status_code==404
    assert 'Find your booking' not in guest.get('/bookings',follow_redirects=True).get_data(as_text=True)
    client,_=client_with_csrf(app)
    assert client.get('/bookings').location.endswith('/account#bookings')
    html=client.get('/account').get_data(as_text=True)
    assert 'id="bookings"' in html and 'href="/account#bookings"' in html
    assert 'Find it with your email' not in html


@pytest.mark.parametrize('destination',['seats','participate'])
def test_guest_booking_prompt_preserves_login_and_registration_destination(app,destination):
    guest,_=anonymous(app)
    html=guest.get('/events/silver-lance').get_data(as_text=True)
    links=re.findall(r'href="([^"]+)"',html)
    for auth in ['/login','/register']:
        assert any(urlsplit(link).path==auth and parse_qs(urlsplit(link).query).get('next')==[f'/events/silver-lance/{destination}'] for link in links)
    assert 'Log in to book' in html and 'Log in to participate' in html
    register(guest,next=f'/events/silver-lance/{destination}')
    assert guest.get(f'/events/silver-lance/{destination}').status_code==200


def test_account_cancellation_controls_require_eligibility_ownership_and_csrf(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirm(client,headers,booking)
    path=f"/api/bookings/{booking['id']}/cancel"
    html=client.get('/account').get_data(as_text=True)
    assert f'data-cancel-booking="{booking["id"]}"' in html
    assert client.post(path,json={}).status_code==403
    stranger,other_headers=client_with_csrf(app)
    assert stranger.post(path,json={},headers=other_headers).status_code==403
    guest,guest_headers=anonymous(app)
    assert guest.post(path,json={},headers=guest_headers).status_code==401
    with app.app_context(),transaction() as db:
        db.execute('UPDATE events SET start_at=? WHERE id=1',(now()+3600,))
    assert f'data-cancel-booking="{booking["id"]}"' not in client.get('/account').get_data(as_text=True)
    assert client.post(path,json={},headers=headers).status_code==409
    with app.app_context(),transaction() as db:
        db.execute('UPDATE events SET start_at=? WHERE id=1',(now()+172800,))
    assert client.post(path,json={},headers=headers).json['status']=='cancelled'
    assert f'data-cancel-booking="{booking["id"]}"' not in client.get('/account').get_data(as_text=True)


def test_checked_in_booking_has_no_account_cancel_control(app,browser):
    client,headers=browser
    booking=reserve(client,headers,payload=seat_payload(app)).json
    confirm(client,headers,booking)
    with app.app_context(),transaction() as db:
        db.execute('UPDATE gate_passes SET checked_at=? WHERE booking_id=?',(now(),booking['id']))
    assert f'data-cancel-booking="{booking["id"]}"' not in client.get('/account').get_data(as_text=True)
    assert client.post(f"/api/bookings/{booking['id']}/cancel",json={},headers=headers).status_code==409
