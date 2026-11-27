from pathlib import Path


def test_detailed_viewers_offer_people_toggle(browser):
    client,_=browser
    for slug in ['silver-lance','iron-colosseum','kings-mark','victors-feast']:
        response=client.get('/events/'+slug)
        assert response.status_code==200
        # One showcase control and one expanded viewer control.
        assert response.data.count(b'data-3d-people')==2
    assert b'data-3d-people' not in client.get('/events/silver-lance/seats').data.split(b'id="seat-preview-dialog"')[1].split(b'</dialog>')[0]


def test_people_lifecycle_is_scoped_to_detailed_views():
    root=Path(__file__).resolve().parents[1]
    source=(root/'static/js/venue3d.js').read_text(encoding='utf-8')
    assert "if ((mode === 'showcase' || mode === 'modal') && this.surroundings)" in source
    assert 'this.people?.update(dt)' in source
    assert 'this.people?.dispose()' in source
    assert 'this.people?.setMotionEnabled(!MOTION.matches)' in source
    assert "window.removeEventListener('tg-venue-people', this.onPeoplePreference)" in source
