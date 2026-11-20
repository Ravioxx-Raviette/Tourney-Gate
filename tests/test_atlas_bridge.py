"""Check the visible bridge edges against actual road endpoints and tangents."""
import math
import re
import xml.etree.ElementTree as ET
import pytest


def numbers(value):
    return [float(number) for number in re.findall(r'-?\d+(?:\.\d+)?',value)]


@pytest.fixture
def artwork(app):
    with app.app_context():
        return ET.fromstring(app.jinja_env.get_template('atlas_map.html').render())


@pytest.mark.parametrize('route,signs',[(1,(-1,-1)),(2,(1,-1)),(3,(1,1)),(4,(-1,1))])
def test_road_meets_symmetric_bridge_entrance_with_matching_tangent(artwork,route,signs):
    bridge=artwork.find(".//g[@class='atlas-bridge']")
    center=numbers(bridge.attrib['transform'])
    assert center==[565,431]
    entrance=bridge.find(f".//g[@data-bridge-route='{route}']")
    corners=[(float(node.attrib['cx']),float(node.attrib['cy'])) for node in entrance.findall('circle')]
    assert len(corners)==2
    midpoint=tuple(sum(point[axis] for point in corners)/2 for axis in [0,1])
    assert math.hypot(*midpoint)==pytest.approx(64,abs=.001)
    assert math.dist(*corners)==pytest.approx(22,abs=.001)
    assert all(midpoint[axis]*signs[axis]>0 for axis in [0,1])
    assert math.degrees(math.atan(abs(midpoint[1]/midpoint[0])))==pytest.approx(28,abs=.001)
    deck=numbers(bridge.find("path[@class='atlas-bridge-deck']").attrib['d'])
    vertices=list(zip(deck[::2],deck[1::2]))
    assert all(any(math.dist(corner,vertex)<.001 for vertex in vertices) for corner in corners)
    road=numbers(artwork.find(f".//path[@data-route='{route}']").attrib['d'])
    assert len(road)==8
    end,control=road[-2:],road[-4:-2]
    expected=tuple(center[axis]+midpoint[axis] for axis in [0,1])
    assert math.dist(end,expected)<.001
    tangent=(end[0]-control[0],end[1]-control[1])
    inward=(-midpoint[0],-midpoint[1])
    scale=math.hypot(*tangent)*math.hypot(*inward)
    cross=tangent[0]*inward[1]-tangent[1]*inward[0]
    dot=sum(tangent[axis]*inward[axis] for axis in [0,1])
    assert abs(cross)/scale<.0001
    assert dot/scale>.99999


def test_all_road_layers_share_identical_paths(artwork):
    layers=[artwork.find(f".//g[@class='{name}']") for name in ['atlas-road-bed','atlas-road-surface','atlas-paths']]
    paths=[[node.attrib['d'] for node in layer.findall('path')] for layer in layers]
    assert all(len(layer)==4 for layer in paths)
    assert paths[0]==paths[1]==paths[2]
    assert {node.attrib['data-route'] for node in layers[2]}=={'1','2','3','4'}


def cubic_points(points,steps=100):
    for index in range(steps+1):
        t=index/steps
        weights=((1-t)**3,3*(1-t)**2*t,3*(1-t)*t*t,t**3)
        yield tuple(sum(weights[i]*points[i][axis] for i in range(4)) for axis in [0,1])


def river_points(artwork):
    # Sample the actual centerline shared by every bank/water stroke.
    tokens=re.findall(r'[MCL]|-?\d+(?:\.\d+)?',artwork.find(".//path[@id='atlas-map-river']").attrib['d'])
    index=0;current=None;points=[]
    while index<len(tokens):
        command=tokens[index];index+=1
        count={'M':2,'L':2,'C':6}[command]
        values=[float(value) for value in tokens[index:index+count]];index+=count
        if command=='M':
            current=tuple(values)
        elif command=='L':
            end=tuple(values)
            points.extend((current[0]+(end[0]-current[0])*t/200,current[1]+(end[1]-current[1])*t/200) for t in range(201))
            current=end
        else:
            curve=[current,tuple(values[:2]),tuple(values[2:4]),tuple(values[4:])]
            points.extend(cubic_points(curve,steps=1000));current=curve[-1]
    return points


@pytest.mark.parametrize('route',[1,2,3,4])
def test_full_bridge_entrance_landing_and_road_are_supported_by_dry_banks(artwork,route):
    river=river_points(artwork)
    bank=artwork.find(".//use[@class='atlas-river-bank']")
    bank_radius=float(bank.attrib['stroke-width'])/2
    distance=lambda point:min(math.dist(point,sample) for sample in river)
    bridge=artwork.find(".//g[@class='atlas-bridge']")
    center=numbers(bridge.attrib['transform'])
    entrance=bridge.find(f".//g[@data-bridge-route='{route}']")
    corners=[(float(node.attrib['cx'])+center[0],float(node.attrib['cy'])+center[1]) for node in entrance.findall('circle')]
    # Check the whole entrance width, allowing for the two-unit parapet overhang.
    for step in range(21):
        point=tuple(corners[0][axis]+(corners[1][axis]-corners[0][axis])*step/20 for axis in [0,1])
        assert distance(point)-bank_radius-2>=6
    landing_group=artwork.find(".//g[@class='atlas-bridge-landings']")
    landing=landing_group.find(f"path[@data-landing-route='{route}']")
    values=numbers(landing.attrib['d']);vertices=list(zip(values[::2],values[1::2]))
    assert len(vertices)==4
    stroke_radius=float(landing_group.attrib['stroke-width'])/2
    for i,start in enumerate(vertices):
        end=vertices[(i+1)%4]
        for step in range(11):
            point=tuple(start[axis]+(end[axis]-start[axis])*step/10 for axis in [0,1])
            assert distance(point)-bank_radius-stroke_radius>=6
    road=artwork.find(f".//path[@data-route='{route}']")
    values=numbers(road.attrib['d']);curve=list(zip(values[::2],values[1::2]))
    road_radius=float(artwork.find(".//g[@class='atlas-road-bed']").attrib['stroke-width'])/2
    for point in cubic_points(curve):
        assert distance(point)-bank_radius-road_radius>=6
