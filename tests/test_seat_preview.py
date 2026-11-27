def test_supported_booking_page_loads_seat_preview(browser):
    client, _ = browser
    html = client.get('/events/silver-lance/seats').get_data(as_text=True)
    assert 'id="seat-preview-dialog"' in html
    assert 'js/seat-preview-loader.js' in html
    assert 'Illustrative view from the 3D model; actual sightlines may differ.' in html


def test_other_venues_keep_existing_booking_page(browser):
    client, _ = browser
    html = client.get('/events/iron-colosseum/seats').get_data(as_text=True)
    assert 'id="seat-preview-dialog"' in html
    assert 'js/seat-preview-loader.js' in html
    assert 'id="reserve-button"' in html


def test_preview_modules_are_served_as_javascript(browser):
    client, _ = browser
    for name in ['seat-layout.mjs', 'seat-preview.js', 'seat-preview-loader.js']:
        response = client.get('/static/js/' + name)
        assert response.status_code == 200
        assert response.mimetype == 'text/javascript'


def test_party_assistant_only_on_supported_venue(browser):
    client, _ = browser
    html = client.get('/events/silver-lance/seats').get_data(as_text=True)
    assert 'id="party-form"' in html and 'js/party-assistant.js' in html
    other = client.get('/events/iron-colosseum/seats').get_data(as_text=True)
    assert 'id="party-form"' in other


def test_all_twenty_catalogue_events_offer_both_tools(app,tmp_path):
    from db import init_db,get_db
    from seed import seed_demo
    from conftest import client_with_csrf
    app.config['DATABASE']=str(tmp_path/'full-catalogue.sqlite')
    with app.app_context():
        init_db();seed_demo()
        events=get_db().execute('SELECT slug FROM events').fetchall()
        assert len(events)==20
    client,_=client_with_csrf(app)
    for event in events:
        response=client.get('/events/'+event['slug']+'/seats')
        assert response.status_code==200,event['slug']
        assert b'id="party-form"' in response.data,event['slug']
        assert b'id="seat-preview-dialog"' in response.data,event['slug']
