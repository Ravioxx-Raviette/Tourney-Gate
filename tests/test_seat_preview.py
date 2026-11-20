def test_supported_booking_page_loads_seat_preview(browser):
    client, _ = browser
    html = client.get('/events/silver-lance/seats').get_data(as_text=True)
    assert 'id="seat-preview-dialog"' in html
    assert 'js/seat-preview-loader.js' in html
    assert 'Illustrative view from the 3D model; actual sightlines may differ.' in html


def test_other_venues_keep_existing_booking_page(browser):
    client, _ = browser
    html = client.get('/events/iron-colosseum/seats').get_data(as_text=True)
    assert 'id="seat-preview-dialog"' not in html
    assert 'js/seat-preview-loader.js' not in html
    assert 'id="reserve-button"' in html


def test_preview_modules_are_served_as_javascript(browser):
    client, _ = browser
    for name in ['seat-layout.mjs', 'seat-preview.js', 'seat-preview-loader.js']:
        response = client.get('/static/js/' + name)
        assert response.status_code == 200
        assert response.mimetype == 'text/javascript'
