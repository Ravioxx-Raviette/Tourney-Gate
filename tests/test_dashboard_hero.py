from html.parser import HTMLParser
from conftest import client_with_csrf


class Sections(HTMLParser):
    def __init__(self):
        super().__init__();self.sections=[];self.gate_sections=[];self.stat_sections=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='section':self.sections.append(attrs.get('class',''))
        if tag=='a' and attrs.get('href')=='/gate':self.gate_sections.append(list(self.sections))
        if attrs.get('id')=='stat-sold':self.stat_sections=list(self.sections)
    def handle_endtag(self,tag):
        if tag=='section':self.sections.pop()


def test_dashboard_hero_separates_actions_from_metrics(app):
    owner,_=client_with_csrf(app,role='owner')
    html=owner.get('/admin').get_data(as_text=True)
    sections=Sections();sections.feed(html)
    assert any(any('admin-dashboard-hero' in value for value in chain) for chain in sections.gate_sections)
    assert not any('admin-dashboard-hero' in value for value in sections.stat_sections)
    assert 'css/admin-dashboard.css' in html
    assert 'Start here' in html and 'automatically confirmed' in html
    assert 'Unsold places minus active reservations.' in html
    assert 'No real payments' in html
    assert 'id="admin-inventory"' in html and 'id="admin-ledger"' in html
    for control in ['stat-sold','stat-available','stat-revenue','add-event','admin-events','admin-bookings','admin-update']:
        assert html.count('id="'+control+'"')==1


def test_dashboard_guide_explains_role_permissions(app):
    for role,description in [('owner','assign User, Gate Staff or Admin roles'),('admin','manage regular user accounts')]:
        client,_=client_with_csrf(app,role=role)
        html=client.get('/admin').get_data(as_text=True)
        assert description in html
        assert 'href="#admin-inventory"' in html and 'href="#admin-ledger"' in html
