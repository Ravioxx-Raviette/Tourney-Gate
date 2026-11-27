import html
import re
from urllib.parse import urlsplit,parse_qs


def test_guest_navigation_has_one_combined_account_entry(app):
    client=app.test_client()
    for path in ['/','/login','/register']:
        page=client.get(path).get_data(as_text=True)
        nav=page.split('<nav id="navigation"',1)[1].split('</nav>',1)[0]
        assert 'Log in / Register' in nav
        assert nav.count('href="/login"')==1
        assert 'href="/register"' not in nav
        assert 'nav-auth-entry' in nav


def test_account_page_switches_preserve_booking_destination(app):
    client=app.test_client();destination='/events/silver-lance/seats'
    login=client.get('/login',query_string={'next':destination}).get_data(as_text=True)
    def switch_link(page):
        switch=page.split('<p class="auth-switch">',1)[1].split('</p>',1)[0]
        return html.unescape(re.search(r'href="([^"]+)"',switch)[1])
    register_link=switch_link(login)
    assert urlsplit(register_link).path=='/register'
    assert parse_qs(urlsplit(register_link).query)['next']==[destination]
    registration=client.get(register_link)
    assert registration.status_code==200
    login_link=switch_link(registration.get_data(as_text=True))
    assert urlsplit(login_link).path=='/login'
    assert parse_qs(urlsplit(login_link).query)['next']==[destination]
