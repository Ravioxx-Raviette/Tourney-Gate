"""The Home atlas and conventional discovery pages share a navigable shell."""
import json
import re
import pytest
from db import transaction,now


def bootstrap(response):
    html=response.get_data(as_text=True)
    match=re.search(r'<script id="atlas-data" type="application/json">(.*?)</script>',html,re.S)
    assert match is not None
    return html,json.loads(match.group(1))


def visible_cards(html):
    return [body for attrs,body in re.findall(r'<article\b([^>]*)>(.*?)</article>',html,re.S)
            if 'event-card' in attrs and not re.search(r'\bhidden\b',attrs)]


@pytest.mark.parametrize('path,page',[('/', 'home'),('/events','events'),('/events/silver-lance','event')])
def test_discovery_routes_use_shared_shell_and_correct_layout(browser,path,page):
    client,_=browser
    response=client.get(path)
    assert response.status_code==200
    html=response.get_data(as_text=True)
    assert f'data-page="{page}"' in html
    assert '<header class="site-header">' in html
    assert '<footer class="site-footer">' in html
    assert 'is-atlas' not in html
    assert 'atlas-header' not in html
    if page=='home':
        _,data=bootstrap(response)
        assert len(data['events'])==5 and len(data['venues'])==4
        assert all(f'id="landmark-{venue}"' in html for venue in range(1,5))
        assert 'id="discover"' in html and 'id="about"' in html and 'id="faq"' in html
        assert 'hero-art' not in html and '<dialog' not in html
    else:
        assert 'atlas-data' not in html and 'atlas-map-plane' not in html
        assert ('id="events-grid"' if page=='events' else 'class="container detail-layout"') in html


def test_royal_lists_home_preview_groups_both_events(browser):
    client,_=browser
    html,data=bootstrap(client.get('/?venue=1'))
    assert data['selected_venue']==1
    preview=html.split('id="atlas-preview-content"',1)[1].split('</aside>',1)[0]
    assert 'The Tourney of the Silver Lance' in preview
    assert 'Battle of the Five Banners' in preview and 'Sold out' in preview
    assert 'Games of the Iron Colosseum' not in preview
    assert '/?venue=1#atlas' in html and '/events?venue=1' in preview


def test_combined_filters_are_server_rendered_and_venue_is_preserved(browser):
    client,_=browser
    html=client.get('/events?venue=3&category=Archery+Contest&price=350&date=2027-03-01&search=mark').get_data(as_text=True)
    cards=visible_cards(html)
    assert len(cards)==1 and 'The King’s Mark' in cards[0]
    assert 'value="3" selected' in html
    assert 'value="350" selected' in html and 'value="2027-03-01"' in html
    assert '<noscript>' in html and 'method="get"' in html
    listing=client.get('/events?venue=1').get_data(as_text=True)
    assert len(visible_cards(listing))==2
    empty=client.get('/events?search=no-matching-gathering').get_data(as_text=True)
    assert visible_cards(empty)==[]
    assert 'id="no-results" class="empty-state" >' in empty
    assert 'id="clear-event-filters"' in empty


def test_detail_page_contains_content_and_booking_handoffs(browser):
    client,_=browser
    html=client.get('/events/iron-colosseum').get_data(as_text=True)
    assert '/events/iron-colosseum/seats' in html and '/events/iron-colosseum/participate' in html
    assert 'Arena District · Manila' in html and 'Noble Stand' in html
    assert 'class="schedule"' in html
    sold_out=client.get('/events/five-banners').get_data(as_text=True)
    assert 'disabled>Sold out</button>' in sold_out
    assert '/events/five-banners/seats' not in sold_out


def test_unmapped_venue_remains_in_listing_and_home_preview(app,browser):
    client,_=browser
    with app.app_context(),transaction() as db:
        db.execute("INSERT INTO venues (id,name,location,layout_type) VALUES (99,'The New Meadow','Demo location','open')")
        event_id=db.execute("INSERT INTO events (venue_id,title,slug,category,description,image,start_at,end_at) VALUES (99,'A New Gathering','new-gathering','Festival Day Pass','A fictional gathering.','joust',?,?)",(now()+864000,now()+880000)).lastrowid
        db.execute("INSERT INTO ticket_tiers (event_id,name,kind,price,capacity,remaining) VALUES (?,'Day pass','counted',10000,5,5)",(event_id,))
    html=client.get('/events?venue=99').get_data(as_text=True)
    assert len(visible_cards(html))==1 and 'A New Gathering' in visible_cards(html)[0]
    home,data=bootstrap(client.get('/?venue=99'))
    assert data['selected_venue']==99 and 'id="landmark-99"' not in home
    assert 'A New Gathering' in home.split('id="atlas-preview-content"',1)[1]
    assert client.get('/events/new-gathering').status_code==200


def test_invalid_selection_is_safe_and_unknown_event_is_404(browser):
    client,_=browser
    _,data=bootstrap(client.get('/?venue=bad'))
    assert data['selected_venue'] is None
    html=client.get('/events?venue=bad&date=2027-99-40&price=-4&category=unknown').get_data(as_text=True)
    assert len(visible_cards(html))==5
    assert client.get('/events/not-a-real-gathering').status_code==404


def test_cancelled_event_stays_discoverable_without_seat_booking(app,browser):
    client,_=browser
    with app.app_context(),transaction() as db:
        db.execute("UPDATE events SET status='cancelled' WHERE slug='silver-lance'")
    listing=client.get('/events?venue=1').get_data(as_text=True)
    assert any('The Tourney of the Silver Lance' in card and 'Cancelled' in card for card in visible_cards(listing))
    detail=client.get('/events/silver-lance').get_data(as_text=True)
    assert 'disabled>Cancelled</button>' in detail
    assert '/events/silver-lance/seats' not in detail


def test_empty_realm_keeps_home_sections_and_listing(app,browser):
    client,_=browser
    with app.app_context(),transaction() as db:
        db.execute('DELETE FROM booking_items')
        db.execute('DELETE FROM seats')
        db.execute('DELETE FROM bookings')
        db.execute('DELETE FROM ticket_tiers')
        db.execute('DELETE FROM events')
    home,data=bootstrap(client.get('/'))
    assert data['events']==[] and 'New gatherings will appear here' in home
    assert 'id="faq"' in home
    listing=client.get('/events').get_data(as_text=True)
    assert visible_cards(listing)==[] and 'No events found' in listing
