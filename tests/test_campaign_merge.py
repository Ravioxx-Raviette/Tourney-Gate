"""Consolidation must retain the UI and load campaign assets only on request."""
import re
from pathlib import Path


def test_home_keeps_ui_features_and_lazy_campaign(browser):
    client, _ = browser
    html = client.get('/').get_data(as_text=True)
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    assert '/static/js/atlas-loader.mjs' in scripts
    assert not any('atlas3d.js' in src for src in scripts)
    assert scripts.count('/static/js/venue3d.js') == 1
    assert not any('venue3d.js?' in src for src in scripts)
    assert 'id="hero-sky-day"' in html and 'hero-booth' in html
    assert 'id="rules"' in html and 'id="a11y-panel"' in html
    assert 'js/cursor-trail.js' in html and 'js/accessibility.js' in html
    assert 'id="atlas-campaign-status"' in html


def test_both_template_helpers_and_capacity_command_survive(app):
    assert callable(app.jinja_env.globals['standard_flutter'])
    assert callable(app.jinja_env.globals['asset_v'])
    assert 'expand-groundlings' in app.cli.commands


def test_detail_retains_booking_participant_and_roof_controls(browser):
    client, _ = browser
    html = client.get('/events/victors-feast').get_data(as_text=True)
    assert 'data-3d-roof' in html
    assert '/events/victors-feast/seats' in html
    html = client.get('/events/silver-lance').get_data(as_text=True)
    assert 'participant-callout-icon' in html and '/events/silver-lance/participate' in html


def test_campaign_module_mime_and_revalidation(browser):
    client, _ = browser
    for path in ['atlas-loader.mjs', 'atlas-runtime.mjs', 'atlas3d.js']:
        response = client.get('/static/js/' + path)
        assert response.status_code == 200
        assert response.mimetype == 'text/javascript'
        assert 'no-cache' in response.headers['Cache-Control']


def test_venue_importers_use_the_same_module_identity():
    scripts = Path(__file__).resolve().parents[1] / 'static' / 'js'
    for file in ['atlas3d.js', 'seat-preview.js']:
        source = (scripts / file).read_text(encoding='utf-8')
        assert "from './venue3d.js'" in source
        assert 'venue3d.js?' not in source
