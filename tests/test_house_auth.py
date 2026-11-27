import json
from urllib.parse import parse_qs, urlsplit

from db import get_db
from test_accounts import HOUSE, anonymous, csrf, login, register
from test_booking import BUYER, seat_payload


def submit_house(client, **extra):
    return client.post('/house', data={**HOUSE, 'csrf_token': csrf(client)['X-CSRF-Token'], **extra})


def test_guest_house_requires_registration_and_is_only_a_draft(app):
    client, _ = anonymous(app)
    page = client.get('/house').get_data(as_text=True)
    assert 'Register to save my House' in page
    response = submit_house(client)
    assert response.status_code == 302
    assert urlsplit(response.location).path == '/register'
    assert parse_qs(urlsplit(response.location).query)['next'] == ['/house']
    with client.session_transaction() as state:
        assert state.get('house') is None
        assert state['house_draft'] == HOUSE
    assert b'House Ember' not in client.get('/account').data
    with app.app_context():
        assert get_db().execute('SELECT COUNT(*) FROM account_profiles').fetchone()[0] == 0


def test_registration_keeps_draft_until_signed_in_save_and_booking(app):
    client, _ = anonymous(app)
    submit_house(client)
    assert register(client, next='/house').location.endswith('/house')
    page = client.get('/house').get_data(as_text=True)
    assert 'House Ember' in page and 'id="house-save-feedback"' not in page
    with client.session_transaction() as state:
        assert state.get('house') is None
    with app.app_context():
        assert get_db().execute('SELECT house_json FROM account_profiles').fetchone()[0] is None
    assert submit_house(client).location.endswith('/house?saved=1')
    with client.session_transaction() as state:
        assert state['house'] == HOUSE and 'house_draft' not in state
    with app.app_context():
        assert json.loads(get_db().execute('SELECT house_json FROM account_profiles').fetchone()[0]) == HOUSE
    pending = client.post('/api/events/1/reservations', json=seat_payload(app), headers=csrf(client)).json
    confirmed = client.post('/api/reservations/' + pending['id'] + '/confirm', json=BUYER, headers=csrf(client))
    assert confirmed.status_code == 200 and confirmed.json['house'] == HOUSE


def test_login_preserves_guest_design_without_replacing_saved_house(app):
    client, _ = anonymous(app)
    register(client)
    submit_house(client)
    client.post('/logout', data={'csrf_token': csrf(client)['X-CSRF-Token']})
    response = submit_house(client, name='House Dawn', auth='login')
    assert urlsplit(response.location).path == '/login'
    assert login(client, password='incorrect', next='/house').status_code == 401
    with client.session_transaction() as state:
        assert state['house_draft']['name'] == 'House Dawn'
    assert login(client, next='/house').location.endswith('/house')
    page = client.get('/house').get_data(as_text=True)
    assert 'value="House Dawn"' in page
    with client.session_transaction() as state:
        assert state['house'] == HOUSE
    with app.app_context():
        assert json.loads(get_db().execute('SELECT house_json FROM account_profiles').fetchone()[0]) == HOUSE
    submit_house(client, name='House Dawn')
    with client.session_transaction() as state:
        assert state['house']['name'] == 'House Dawn'


def test_logout_discards_unsaved_house_draft(app):
    client, _ = anonymous(app)
    submit_house(client)
    register(client, next='/house')
    client.post('/logout', data={'csrf_token': csrf(client)['X-CSRF-Token']})
    with client.session_transaction() as state:
        assert 'house' not in state and 'house_draft' not in state


def test_guest_invalid_draft_csrf_and_clear_do_not_save_house(app):
    client, _ = anonymous(app)
    assert client.post('/house', data=HOUSE).status_code == 403
    assert submit_house(client, name='x').status_code == 400
    with client.session_transaction() as state:
        assert state.get('house') is None and state.get('house_draft') is None
    response = client.post('/house/clear', data={'csrf_token': csrf(client)['X-CSRF-Token']})
    assert response.status_code == 302 and '/login?' in response.location


def test_legacy_guest_house_is_not_imported_as_saved_house(app):
    client, _ = anonymous(app)
    with client.session_transaction() as state:
        state['house'] = HOUSE
    client.get('/house')
    register(client)
    with client.session_transaction() as state:
        assert state.get('house') is None
    with app.app_context():
        assert get_db().execute('SELECT house_json FROM account_profiles').fetchone()[0] is None
