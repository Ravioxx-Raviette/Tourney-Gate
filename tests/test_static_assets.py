"""Scripts must load even when Windows registers .js as plain text."""
import mimetypes
import pytest


@pytest.mark.parametrize('path', [
    '/static/js/app.js', '/static/js/motion.js', '/static/js/atlas.js',
    '/static/js/booking.js', '/static/js/admin.js', '/static/js/venue3d.js',
    '/static/vendor/three/three.module.min.js', '/static/vendor/three/OrbitControls.js',
])
def test_javascript_has_executable_mime_type(browser, monkeypatch, path):
    original = mimetypes.guess_type
    monkeypatch.setattr(mimetypes, 'guess_type', lambda url, strict=True:
                        ('text/plain', None) if str(url).endswith('.js') else original(url, strict))
    client, _ = browser
    response = client.get(path)
    assert response.status_code == 200
    assert response.mimetype == 'text/javascript'
    assert response.headers['X-Content-Type-Options'] == 'nosniff'


def test_non_script_and_missing_assets_keep_their_response_types(browser):
    client, _ = browser
    assert client.get('/static/css/style.css').mimetype == 'text/css'
    response = client.get('/static/js/missing.js')
    assert response.status_code == 404
    assert response.mimetype == 'text/html'
