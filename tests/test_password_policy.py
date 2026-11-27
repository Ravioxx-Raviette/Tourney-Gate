import re

import pytest
from werkzeug.security import generate_password_hash

from db import get_db, transaction
from test_accounts import anonymous, csrf, login, register


@pytest.mark.parametrize('length,expected', [(7,400),(8,302),(12,302),(13,400),(128,400)])
def test_registration_enforces_eight_to_twelve_characters(app,length,expected):
    client,_=anonymous(app)
    password='a'*length
    response=register(client,password=password,password_confirm=password)
    assert response.status_code==expected
    with app.app_context():
        assert get_db().execute('SELECT COUNT(*) FROM users').fetchone()[0]==(1 if expected==302 else 0)
    if expected==400:
        assert b'between 8 and 12 characters' in response.data


def test_registration_fields_match_policy_without_limiting_legacy_login(app):
    client,_=anonymous(app)
    page=client.get('/register').get_data(as_text=True)
    fields=re.findall(r'<input[^>]+type="password"[^>]*>',page)
    assert len(fields)==2
    assert all('minlength="8"' in field and 'maxlength="12"' in field for field in fields)
    assert 'Use 8–12 characters.' in page
    login_field=re.search(r'<input[^>]+type="password"[^>]*>',client.get('/login').get_data(as_text=True))[0]
    assert 'maxlength="128"' in login_field


def test_existing_long_password_remains_valid_for_login(app):
    client,_=anonymous(app)
    assert register(client,password='ValidPass123',password_confirm='ValidPass123').status_code==302
    legacy='existing-long-password-123'
    with app.app_context(),transaction() as db:
        db.execute('UPDATE users SET password_hash=?',(generate_password_hash(legacy),))
    client.post('/logout',data={'csrf_token':csrf(client)['X-CSRF-Token']})
    assert login(client,password=legacy).status_code==302
    assert client.get('/account').status_code==200
