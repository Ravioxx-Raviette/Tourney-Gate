"""Keyframes for the fluttering house standard (templates/house-badge.html).

The banner cloth is an SVG in a 180 x 200 box. Each frame describes the cloth's outline, its gold
edge lines, and two sheen bands (a highlight and a shadow) that travel across it. The bands are drawn
between curves interpolated from the cloth's own left and right edges, so they bend exactly as the
cloth bends. All shapes share one set of evenly spaced frames, so they stay in step.
"""
from functools import lru_cache

DURATION = 6.5  # seconds; the crest-and-lettering sway in CSS uses the same rhythm
FRAMES = 40

# Poses: right edge controls (r1, r2), right tip, right hem control, notch, left hem control,
# left tip, left edge control (l2). The top corners stay fixed on the crossbar at x=28 and x=152.
_REST = (152, 152, 152, 200, 121, 184, 90, 168, 59, 184, 28, 200, 28)
_POSES = [
    (0.0, _REST),
    (0.28, (152, 149, 144, 199, 114, 183, 84, 167, 54, 184, 22, 197, 25)),  # hem drifts left
    (0.5, _REST),
    (0.75, (152, 154, 157, 199, 126, 184, 95, 168, 64, 185, 32, 200, 30)),  # and a little right
    (1.0, _REST),
]


def _ease(x):
    """Smooth ease-in-out, so each drift starts and settles gently."""
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def _pose_at(t):
    for (t0, a), (t1, b) in zip(_POSES, _POSES[1:]):
        if t0 <= t <= t1:
            k = _ease((t - t0) / (t1 - t0))
            return [p + (q - p) * k for p, q in zip(a, b)]
    return list(_REST)


def _fmt(*values):
    return ' '.join(f'{v:.1f}'.rstrip('0').rstrip('.') for v in values)


def _cloth(p):
    r1, r2, rtx, rty, rqx, rqy, nx, ny, lqx, lqy, ltx, lty, l2 = p
    return (f'M28 0L152 0C{_fmt(r1, 60, r2, 130, rtx, rty)}Q{_fmt(rqx, rqy, nx, ny)}'
            f'Q{_fmt(lqx, lqy, ltx, lty)}C{_fmt(l2, 130, 28, 60, 28, 0)}Z')


def _lines(p):
    r1, r2, rtx, rty, *_, ltx, lty, l2 = p
    return (f'M35 0C{_fmt(35, 60, l2 + 7, 130, ltx + 9, lty - 10)}'
            f'M145 0C{_fmt(145, 60, r2 - 7, 130, rtx - 9, rty - 10)}')


def _curve_at(p, u):
    """The curve running down the cloth a fraction u of the way from its left edge to its right."""
    r1, r2, rtx, rty, *_, ltx, lty, l2 = p
    lerp = lambda a, b: a + (b - a) * u
    return [(lerp(28, 152), 0), (lerp(28, r1), 60), (lerp(l2, r2), 130), (lerp(ltx, rtx), lerp(lty, rty) + 12)]


def _band(p, centre, width):
    a, b = _curve_at(p, centre - width / 2), _curve_at(p, centre + width / 2)
    return (f'M{_fmt(*a[0])}C{_fmt(*a[1], *a[2], *a[3])}L{_fmt(*b[3])}'
            f'C{_fmt(*b[2], *b[1], *b[0])}Z')


@lru_cache(maxsize=1)
def standard_flutter():
    times = [i / FRAMES for i in range(FRAMES + 1)]
    poses = [_pose_at(t) for t in times]
    # The sheen enters past the left edge and leaves past the right, so the loop restarts unseen.
    centres = [-0.35 + 1.7 * t for t in times]
    return {
        'dur': f'{DURATION}s',
        'key_times': ';'.join(f'{t:.4f}'.rstrip('0').rstrip('.') or '0' for t in times),
        'cloth': ';'.join(_cloth(p) for p in poses),
        'lines': ';'.join(_lines(p) for p in poses),
        'light': ';'.join(_band(p, c, 0.13) for p, c in zip(poses, centres)),
        'dark': ';'.join(_band(p, c + 0.2, 0.15) for p, c in zip(poses, centres)),
        'rest_cloth': _cloth(_REST), 'rest_lines': _lines(_REST),
        'rest_light': _band(_REST, centres[0], 0.13), 'rest_dark': _band(_REST, centres[0] + 0.2, 0.15),
    }
