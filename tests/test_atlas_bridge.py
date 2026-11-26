"""Check roads against the visible, rotated bridges and actual river banks."""
import math
import re
import xml.etree.ElementTree as ET
import pytest


def numbers(value):
    return [float(number) for number in re.findall(r'-?\d+(?:\.\d+)?', value)]


@pytest.fixture
def artwork(app):
    with app.app_context():
        return ET.fromstring(app.jinja_env.get_template('atlas_map.html').render())


def transform(bridge, point, inverse=False):
    x, y, angle = numbers(bridge.attrib['transform'])
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    if inverse:
        px, py = point[0]-x, point[1]-y
        return c*px+s*py, -s*px+c*py
    return x+c*point[0]-s*point[1], y+s*point[0]+c*point[1]


def cubic_points(points, steps=100):
    for index in range(steps+1):
        t = index/steps
        weights = ((1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3)
        yield tuple(sum(weights[i]*points[i][axis] for i in range(4)) for axis in [0, 1])


def path_points(value, steps=40):
    tokens = re.findall(r'[MCL]|-?\d+(?:\.\d+)?', value)
    index, current, points, command = 0, None, [], None
    while index < len(tokens):
        if tokens[index] in ('M', 'C', 'L'):
            command = tokens[index]
            index += 1
        count = {'M': 2, 'L': 2, 'C': 6}[command]
        values = [float(value) for value in tokens[index:index+count]]
        index += count
        end = tuple(values[-2:])
        if command == 'M':
            points.append(end)
        elif command == 'L':
            points.extend((current[0]+(end[0]-current[0])*t/steps,
                           current[1]+(end[1]-current[1])*t/steps) for t in range(steps+1))
        else:
            points.extend(cubic_points([current, tuple(values[:2]), tuple(values[2:4]), end], steps))
        current = end
    return points


@pytest.mark.parametrize('route,side', [(1, -1), (2, 1), (3, 1), (4, -1)])
def test_road_meets_rotated_bridge_deck_or_approach(artwork, route, side):
    bridge = artwork.find(".//g[@class='atlas-bridge']")
    assert bridge.find("path[@class='atlas-bridge-deck']").attrib['d'] == 'M-57 -12H57V12H-57Z'
    road = numbers(artwork.find(f".//path[@data-route='{route}']").attrib['d'])
    end, control = road[-2:], road[-4:-2]
    lx, ly = transform(bridge, end, inverse=True)
    assert side*lx == pytest.approx(57, abs=8), 'Road must reach the correct bridgehead'
    assert abs(ly) < 12-6.5, 'Full road width must fit inside the bridge approach'
    tangent = (end[0]-control[0], end[1]-control[1])
    center = transform(bridge, (0, 0))
    inward = (center[0]-end[0], center[1]-end[1])
    alignment = sum(tangent[i]*inward[i] for i in [0, 1]) / (math.hypot(*tangent)*math.hypot(*inward))
    assert alignment > .7, 'Road must approach the deck rather than run along its parapet'


def test_all_road_layers_share_identical_paths(artwork):
    layers = [artwork.find(f".//g[@class='{name}']") for name in ['atlas-road-bed', 'atlas-road-surface', 'atlas-paths']]
    paths = [[node.attrib['d'] for node in layer.findall('path')] for layer in layers]
    assert all(len(layer) == 4 for layer in paths)
    assert paths[0] == paths[1] == paths[2]
    assert {node.attrib['data-route'] for node in layers[2]} == {'1', '2', '3', '4'}


@pytest.mark.parametrize('route', [1, 2, 3, 4])
def test_highway_width_is_supported_by_dry_banks(artwork, route):
    river = path_points(artwork.find(".//path[@id='atlas-map-river']").attrib['d'], steps=120)
    bank_radius = float(artwork.find(".//use[@class='atlas-river-bank']").attrib['stroke-width'])/2
    road_radius = float(artwork.find(".//g[@class='atlas-road-bed']").attrib['stroke-width'])/2
    bridge = artwork.find(".//g[@class='atlas-bridge']")
    for point in path_points(artwork.find(f".//path[@data-route='{route}']").attrib['d']):
        clearance = min(math.dist(point, sample) for sample in river)-bank_radius-road_radius
        lx, ly = transform(bridge, point, inverse=True)
        # The bridge's drawn stone aprons support the last part of each approach.
        # Require the full road width inside the deck/apron, not just its centerline.
        apron_width = 12 if abs(lx) <= 57 else 14 + (abs(lx)-57)*3/17
        supported = abs(lx)+road_radius <= 74 and abs(ly)+road_radius <= apron_width
        assert clearance >= 6 or supported, f'Route {route} leaves bank and bridge at {point}'


@pytest.mark.parametrize('side', [-1, 1])
def test_full_bridgehead_has_a_dry_landing(artwork, side):
    river = path_points(artwork.find(".//path[@id='atlas-map-river']").attrib['d'], steps=120)
    bank_radius = float(artwork.find(".//use[@class='atlas-river-bank']").attrib['stroke-width'])/2
    bridge = artwork.find(".//g[@class='atlas-bridge']")
    for step in range(21):
        point = transform(bridge, (side*74, -17+34*step/20))
        assert min(math.dist(point, sample) for sample in river)-bank_radius-2 >= 6


@pytest.mark.parametrize('index,half_span', [(0, 45), (1, 50)])
def test_side_bridge_roads_meet_the_visible_deck(artwork, index, half_span):
    bridge = artwork.findall(".//g[@class='atlas-bridge-small']")[index]
    roads = artwork.find(".//g[@class='atlas-side-road-bed']").findall('path')
    left = path_points(roads[index*2].attrib['d'])[-1]
    right = path_points(roads[index*2+1].attrib['d'])[0]
    for point, side in [(left, -1), (right, 1)]:
        lx, ly = transform(bridge, point, inverse=True)
        assert lx == pytest.approx(side*half_span, abs=2)
        assert abs(ly) < 3, 'Approach must meet the center of the small bridge'
