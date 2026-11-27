import re
from conftest import client_with_csrf


def navigation(html):
    return html.split('<nav id="navigation"',1)[1].split('</nav>',1)[0]


def test_owner_navigation_focuses_on_management(app):
    owner,_=client_with_csrf(app,role='owner')
    html=owner.get('/admin').get_data(as_text=True)
    nav=navigation(html)
    links=re.findall(r'<a[^>]+href="([^"]+)"',nav)
    assert links==['/','/admin','/admin/users','/admin/activity','/gate']
    assert 'aria-current="page"' in nav
    header=html.split('<header class="site-header">',1)[1].split('</header>',1)[0]
    assert 'aria-label="Log out"' in header
    assert '/itinerary' not in header and '/house' not in header and '/account' not in header
    assert 'href="/admin" aria-label="Tourney Gate dashboard"' in header


def test_customer_and_other_role_navigation_remains_available(app):
    for role in ['user','staff','admin']:
        client,_=client_with_csrf(app,role=role)
        nav=navigation(client.get('/account').get_data(as_text=True))
        assert 'My account' in nav and '/house' in nav and '/itinerary' in nav
        assert ('href="/gate"' in nav)==(role in ['staff','admin'])
    guest=app.test_client()
    nav=navigation(guest.get('/login').get_data(as_text=True))
    assert 'Log in' in nav and 'Register' in nav


def test_owner_management_links_mark_current_section(app):
    owner,_=client_with_csrf(app,role='owner')
    for path in ['/','/admin/users','/admin/activity','/gate']:
        nav=navigation(owner.get(path).get_data(as_text=True))
        assert f'href="{path}" aria-current="page"' in nav



def test_owner_default_login_lands_on_dashboard(app):
    from db import get_db
    from test_accounts import anonymous,login
    owner,_=client_with_csrf(app,role='owner')
    assert owner.get('/login').location.endswith('/admin')
    assert owner.get('/login?next=/account').location.endswith('/account')
    with owner.session_transaction() as state:uid=state['user_id']
    with app.app_context():email=get_db().execute('SELECT email FROM users WHERE id=?',(uid,)).fetchone()[0]
    client,_=anonymous(app)
    response=login(client,email=email,password='fixture-password-123',next='')
    assert response.location.endswith('/admin')
    assert client.get('/account').status_code==200
