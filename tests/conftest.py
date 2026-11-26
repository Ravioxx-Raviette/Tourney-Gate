import sys
from pathlib import Path
import pytest
import secrets
from werkzeug.security import generate_password_hash
_TEST_PASSWORD_HASH=generate_password_hash('fixture-password-123')

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import create_app


@pytest.fixture
def app(tmp_path):
    application=create_app({'TESTING':True,'SECRET_KEY':'test-only','DATABASE':str(tmp_path/'test.sqlite')})
    # Stable legacy IDs isolate booking/security regressions from catalogue growth.
    import shutil
    snapshot = Path(__file__).resolve().parents[1] / 'database/tourney-gate.sqlite'
    shutil.copyfile(snapshot, tmp_path / 'test.sqlite')
    return application


def client_with_csrf(app, role='user'):
    client=app.test_client()
    client.get('/')
    from db import transaction,now
    with app.app_context(),transaction() as db:
        owner=secrets.token_hex(24)
        cursor=db.execute('INSERT INTO users(name,email,password_hash,role,owner_token,created_at) VALUES (?,?,?,?,?,?)',
            ('Fixture User',owner+'@example.test',_TEST_PASSWORD_HASH,role,owner,now()))
        user_id=cursor.lastrowid
        db.execute('INSERT INTO account_profiles(user_id) VALUES (?)',(user_id,))
    with client.session_transaction() as state:
        state['user_id']=user_id
        state['auth_version']=1
        state['authenticated_at']=now()
        state['owner']=owner
        state.permanent=True
        token=state['csrf']
    return client,{'X-CSRF-Token':token}


@pytest.fixture
def browser(app):
    return client_with_csrf(app)


@pytest.fixture
def admin(app):
    return client_with_csrf(app,role='admin')

