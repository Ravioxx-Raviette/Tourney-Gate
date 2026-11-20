"""Export the code-authored atlas artwork without running Flask or a browser.

Run with .venv/Scripts/python.exe scripts/export_atlas.py.
These illustration studies do not represent live event availability.
"""
from html import escape
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs' / 'atlas-artwork'
VENUES = [('lists','The Royal Lists',32,33),('arena','The Iron Colosseum',73,38),
          ('green','The King’s Green',66,73),('hall','The Great Hall',23,70)]
STYLE = """.landmark-structure{stroke-width:.9}.atlas-cartography{fill:#78643e}
text{font-family:Georgia,serif}.study-title{font-family:Georgia,serif;letter-spacing:2px}
"""


def validate_svg(source):
    tree=ET.fromstring(source)
    ids=[node.attrib['id'] for node in tree.iter() if 'id' in node.attrib]
    if len(ids)!=len(set(ids)):
        raise ValueError('Duplicate SVG identifiers')
    references=set()
    for node in tree.iter():
        for name,value in node.attrib.items():
            if name.endswith('href') and value.startswith('#'):
                references.add(value[1:])
            references.update(re.findall(r'url\(#([^)]*)\)',value))
    missing=references-set(ids)
    if missing:
        raise ValueError(f'Unresolved SVG references: {sorted(missing)}')
    return len(ids),len(references)


def mobile_study(width,draw,landscape):
    plane=width-24
    height=plane if width<=360 else plane*830/1100
    top=60
    body=landscape.replace('<svg ',f'<svg x="12" y="{top}" width="{plane}" height="{height}" ',1)
    items=[]
    for kind,name,x,_ in VENUES:
        y=29 if kind=='lists' else 33 if kind=='arena' else 79
        center_x,center_y=12+x*plane/100,top+y*height/100
        small=width<=360
        art_width,art_height=(92,56) if small else (108,64)
        font=14 if small else 15
        label_width=112 if small else 128
        lines=['The Iron','Colosseum'] if kind=='arena' else [name]
        label_height=len(lines)*font*1.3+10
        full_height=art_height+label_height+25
        art_top=center_y-full_height/2
        art=str(draw(kind)).replace('<svg ',f'<svg x="{center_x-art_width/2}" y="{art_top}" width="{art_width}" height="{art_height}" ',1)
        label_y=art_top+art_height
        texts=''.join(f'<tspan x="{center_x}" dy="{0 if index==0 else font*1.3}">{escape(line)}</tspan>' for index,line in enumerate(lines))
        items.append(art+f'<rect x="{center_x-label_width/2}" y="{label_y}" width="{label_width}" height="{label_height}" fill="#fff4da" stroke="#99712c"/><text x="{center_x}" y="{label_y+font+4}" text-anchor="middle" font-size="{font}" fill="#342a1c">{texts}</text>')
    hidden='.atlas-detail-fine,.atlas-cartography{display:none}'
    if width<=380:
        hidden+='.atlas-detail-secondary{display:none}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height+100}" viewBox="0 0 {width} {height+100}"><title>{width}px atlas artwork study</title><desc>Static artwork layout, not a browser screenshot.</desc><style>{STYLE}{hidden}</style><rect width="100%" height="100%" fill="#f4e8c9"/><text x="12" y="25" font-size="15" fill="#163a57">The festival atlas · {width}px art study</text>{body}{"".join(items)}</svg>'


def export():
    env = Environment(loader=FileSystemLoader(ROOT / 'templates'),autoescape=select_autoescape())
    draw = env.get_template('atlas_landmarks.html').module.landmark
    landscape = env.get_template('atlas_map.html').render()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    map_body = landscape.replace('<svg ', '<svg x="0" y="80" width="1100" height="830" ',1)
    overlays=[]
    for kind,name,x,y in VENUES:
        center_x,center_y=x*11,80+y*8.3
        art_x,art_y=center_x-125,center_y-118
        art=str(draw(kind)).replace('<svg ',f'<svg x="{art_x}" y="{art_y}" width="250" height="153.4" ',1)
        width=234 if kind=='arena' else 208
        label_y=art_y+155
        overlays.append(art+f'<g><rect x="{center_x-width/2}" y="{label_y}" width="{width}" height="37" rx="1" fill="#fff4da" stroke="#99712c"/><text x="{center_x}" y="{label_y+25}" text-anchor="middle" font-size="22" fill="#342a1c">{escape(name)}</text></g>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="940" viewBox="0 0 1100 940"><title>Tourney Gate — Storybook Festival Atlas</title><desc>Original SVG artwork study; event labels are illustrative, not live availability.</desc><style>{STYLE}</style><rect width="1100" height="940" fill="#f4e8c9"/><text x="40" y="35" font-size="15" fill="#9e2b35" class="study-title">TOURNEY GATE · THE FESTIVAL ATLAS</text><text x="40" y="68" font-size="31" fill="#163a57">Storybook venues of the realm</text>{map_body}{"".join(overlays)}</svg>'
    validate_svg(svg)
    (OUTPUT/'atlas.svg').write_text(svg,encoding='utf-8')
    cards=[]
    for index,(kind,name,_,_) in enumerate(VENUES):
        x,y=30+(index%2)*500,100+(index//2)*360
        art=str(draw(kind)).replace('<svg ',f'<svg x="{x+20}" y="{y+10}" width="420" height="258" ',1)
        cards.append(f'<rect x="{x}" y="{y}" width="470" height="330" rx="4" fill="#fcf4df" stroke="#c5a765"/>{art}<text x="{x+235}" y="{y+302}" text-anchor="middle" font-size="25" fill="#163a57">{escape(name)}</text>')
    sheet=f'<svg xmlns="http://www.w3.org/2000/svg" width="1030" height="830" viewBox="0 0 1030 830"><title>Tourney Gate — Four Storybook Miniatures</title><style>{STYLE}</style><rect width="1030" height="830" fill="#f4e8c9"/><text x="30" y="39" class="study-title" fill="#9e2b35" font-size="15">TOURNEY GATE · ORIGINAL SVG ARCHITECTURE</text><text x="30" y="76" fill="#163a57" font-size="32">Four places. Four kinds of spectacle.</text>{"".join(cards)}</svg>'
    validate_svg(sheet)
    (OUTPUT/'landmarks.svg').write_text(sheet,encoding='utf-8')
    for width in [390,320]:
        study=mobile_study(width,draw,landscape)
        validate_svg(study)
        (OUTPUT/f'atlas-{width}.svg').write_text(study,encoding='utf-8')
    for name in ['atlas.svg','landmarks.svg','atlas-390.svg','atlas-320.svg']:
        print(OUTPUT/name)


if __name__=='__main__':
    export()
