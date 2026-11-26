"""Cross-branch discovery and 3D integration, using the current fresh catalogue."""
import json
import re
import pytest
from app import create_app
from conftest import client_with_csrf
from db import init_db, get_db
from seed import seed_demo


@pytest.fixture
def current_app(tmp_path):
    application = create_app({'TESTING': True, 'SECRET_KEY': 'merge-test',
                              'DATABASE': str(tmp_path / 'current.sqlite')})
    with application.app_context():
        init_db()
        assert seed_demo() is True
    return application


def test_current_catalogue_preserved(current_app):
    with current_app.app_context():
        db = get_db()
        assert db.execute('SELECT COUNT(*) FROM events').fetchone()[0] == 20
        assert db.execute('SELECT COUNT(DISTINCT category) FROM events').fetchone()[0] == 5
        assert seed_demo() is False
        assert db.execute('SELECT COUNT(*) FROM events').fetchone()[0] == 20


def test_atlas_and_3d_share_current_catalogue(current_app):
    client = current_app.test_client()
    html = client.get('/?venue=1').get_data(as_text=True)
    match = re.search(r'<script id="atlas-data" type="application/json">(.*?)</script>', html, re.S)
    assert match is not None, 'Home must expose the atlas catalogue'
    data = json.loads(match.group(1))
    assert len(data['events']) == 20
    assert data['selected_venue'] == 1
    assert len([event for event in data['events'] if event['venue_id'] == 1]) == 8
    assert 'venue3d.js' in html and 'faire.css' in html
    assert 'id="schedule"' in html
    # The experience cards and category tabs live on The Events page.
    events_html = client.get('/events').get_data(as_text=True)
    assert 'data-open-3d="silver-lance"' in events_html
    assert 'data-category-tab="Grand Melee"' in events_html


@pytest.mark.parametrize('slug,key', [
    ('silver-lance', 'silver-lance'), ('five-banners', 'five-banners'),
    ('iron-colosseum', 'iron-colosseum'), ('kings-mark', 'kings-mark'),
    ('victors-feast', 'victors-feast'), ('dawn-tilts', 'silver-lance'),
])
def test_detail_keeps_3d_and_booking(current_app, slug, key):
    response = current_app.test_client().get('/events/' + slug)
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert f'data-venue-3d="{key}"' in html
    assert f'/events/{slug}/seats' in html
    assert 'data-3d-preset="top"' in html


def test_combined_venue_filters_keep_3d_links(current_app):
    html = current_app.test_client().get('/events?venue=2&category=Gladiatorial+Games&search=crimson&price=350&date=2027-04-01').get_data(as_text=True)
    cards = [body for attrs, body in re.findall(r'<article\b([^>]*)>(.*?)</article>', html, re.S)
             if 'event-card' in attrs and not re.search(r'\bhidden\b', attrs)]
    assert len(cards) == 1 and 'Trials of the Crimson Sand' in cards[0]
    assert 'data-open-3d="iron-colosseum"' in cards[0]


def test_empty_current_home_is_usable(current_app):
    with current_app.app_context():
        db = get_db()
        # The seed includes a sold-out demo booking, so bookings go first.
        for table in ['booking_houses', 'booking_items', 'bookings', 'seats', 'ticket_tiers', 'events']:
            db.execute('DELETE FROM ' + table)
        db.commit()
    response = current_app.test_client().get('/')
    assert response.status_code == 200
    assert 'New gatherings will appear here' in response.get_data(as_text=True)


def test_spectator_unavailable_event_stays_in_upcoming_schedule(current_app):
    with current_app.app_context():
        db = get_db()
        db.execute("UPDATE ticket_tiers SET remaining=0 WHERE event_id=1 AND kind<>'participant'")
        db.commit()
    html = current_app.test_client().get('/').get_data(as_text=True)
    schedule = html.split('<section id="schedule"', 1)[1].split('</section>', 1)[0]
    assert '/events/silver-lance' in schedule
    # 20 events minus the fully sold-out demo (The Crownwall Skirmish has no participant slots).
    assert '19 gatherings ahead' in schedule
    assert schedule.count('class="upcoming-realm-item') == 19
    assert '/events/crownwall-skirmish' not in schedule
    preview = html.split('id="atlas-preview-content"', 1)[1].split('</aside>', 1)[0]
    assert '/events/five-banners' in preview


@pytest.mark.parametrize('slug,kind', [
    ('dawn-tilts', 'seated'), ('crimson-sand', 'counted'), ('emerald-arrow', 'participant'),
])
def test_fresh_catalogue_booking_round_trip(current_app, slug, kind):
    with current_app.app_context():
        db = get_db()
        event_id = db.execute('SELECT id FROM events WHERE slug=?', (slug,)).fetchone()[0]
        tier = dict(db.execute('SELECT * FROM ticket_tiers WHERE event_id=? AND kind=? LIMIT 1', (event_id, kind)).fetchone())
        item = {'tier_id': tier['id'], 'quantity': 1}
        if kind == 'seated':
            item = {'tier_id': tier['id'], 'seat_ids': [db.execute('SELECT id FROM seats WHERE tier_id=? LIMIT 1', (tier['id'],)).fetchone()[0]]}
    client, headers = client_with_csrf(current_app)
    client.get('/events/' + slug)
    with client.session_transaction() as session:
        headers = {'X-CSRF-Token': session['csrf']}
    payload = {'kind': 'participant' if kind == 'participant' else 'spectator', 'items': [item]}
    if kind == 'participant':
        payload['participant'] = {'legal_name': 'Demo Archer', 'persona': 'Arrow', 'faction': 'Dawn', 'class': 'Archer', 'waiver': True}
    reservation = client.post(f'/api/events/{event_id}/reservations', json=payload, headers=headers)
    assert reservation.status_code == 201
    booking = reservation.json
    assert client.get('/checkout/' + booking['id']).status_code == 200
    confirmed = client.post('/api/reservations/' + booking['id'] + '/confirm', headers=headers,
                            json={'name': 'Demo Guest', 'email': 'merge@example.test', 'phone': '09123456789', 'simulated_payment': True})
    assert confirmed.status_code == 200 and confirmed.json['status'] == 'confirmed'
    assert client.get('/ticket/' + confirmed.json['reference_code']).status_code == 200
    cancelled = client.post('/api/bookings/' + booking['id'] + '/cancel', json={}, headers=headers)
    assert cancelled.status_code == 200 and cancelled.json['status'] == 'cancelled'
    restored = client.get(f'/api/events/{event_id}/availability').json
    assert next(row for row in restored['tiers'] if row['id'] == tier['id'])['remaining'] == tier['remaining']


def test_seeded_demo_event_is_sold_out(current_app):
    html = current_app.test_client().get('/events/crownwall-skirmish').get_data(as_text=True)
    assert 'disabled>Sold out</button>' in html
    assert '/events/crownwall-skirmish/seats' not in html
