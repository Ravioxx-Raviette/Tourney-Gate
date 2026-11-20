import sys
from pathlib import Path
import pytest

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


def client_with_csrf(app):
    client=app.test_client()
    client.get('/')
    with client.session_transaction() as state:
        token=state['csrf']
    return client,{'X-CSRF-Token':token}


@pytest.fixture
def browser(app):
    return client_with_csrf(app)


@pytest.fixture
def admin(app):
    client,headers=client_with_csrf(app)
    with client.session_transaction() as state:
        state['admin']=True
    return client,headers

