import re
import pytest
from conftest import client_with_csrf


@pytest.mark.parametrize('role',['user','staff','admin','owner'])
def test_header_logout_is_accessible_icon_beside_theme(app,role):
    client,headers=client_with_csrf(app,role=role)
    page=client.get('/account').get_data(as_text=True)
    header=page.split('<header class="site-header">',1)[1].split('</header>',1)[0]
    assert 'class="header-account-actions"' in header
    form=re.search(r'<form[^>]*class="header-logout"[^>]*>(.*?)</form>',header,re.S)
    assert form
    assert 'action="/logout"' in form[0] and 'method="post"' in form[0]
    assert 'aria-label="Log out"' in form[1] and 'title="Log out"' in form[1]
    assert '<svg' in form[1] and 'aria-hidden="true"' in form[1]
    assert '>Log out</button>' not in form[1]
    assert 'data-theme-toggle' not in form[1]
    assert header.count('action="/logout"')==1
    assert client.post('/logout',data={}).status_code==403
    assert client.post('/logout',headers=headers).status_code==302
    with client.session_transaction() as session:assert 'user_id' not in session


def test_guest_header_does_not_offer_logout(app):
    page=app.test_client().get('/login').get_data(as_text=True)
    header=page.split('<header class="site-header">',1)[1].split('</header>',1)[0]
    assert 'header-logout' not in header
    assert 'data-theme-toggle' in header and 'Log in / Register' in header
