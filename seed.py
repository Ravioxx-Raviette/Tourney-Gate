"""Repeatable fictional demo data; seeding never resets existing bookings."""
import json
from datetime import datetime, timezone
from db import transaction


def stamp(value):
    return int(datetime.fromisoformat(value + '+08:00').timestamp())


EVENTS = [
    ('The Tourney of the Silver Lance', 'silver-lance', 'Joust', 'joust', '2027-02-13',
     'A clash of courage. A day to remember. Watch the finest knights of the realm ride beneath their house banners in a spectacular tournament of skill, chivalry, and pageantry.',
     [('Royal Box','seated',1500,20,'Front and center · shaded seating · welcome drink'),('Noble Stand','seated',800,80,'Elevated views · reserved numbered seat'),("Commoner’s Bench",'seated',350,200,'A place in the heart of the crowd'),('Knight slot','participant',500,16,'Enter the lists · supervised performance')]),
    ('Games of the Iron Colosseum', 'iron-colosseum', 'Gladiatorial Games', 'arena', '2027-03-06',
     'Step into the roar of the arena. Witness choreographed gladiatorial bouts, daring displays, and the spectacle of the Iron Colosseum. Choose your champion and be part of the story.',
     [('Noble Stand','seated',900,60,'Raised arena seating · excellent sightlines'),("Commoner’s Bench",'seated',400,240,'Reserved seat around the arena'),('Groundling','counted',200,150,'Standing room at the arena rail'),('Gladiator slot','participant',500,12,'Supervised staged bouts · one competitor')]),
    ('The King’s Mark', 'kings-mark', 'Archery Contest', 'archery', '2027-03-20',
     'Steady hands. Quiet anticipation. A single perfect shot. Gather behind the shooting line as the realm’s archers compete for the King’s Mark in a celebration of patience and precision.',
     [("Commoner’s Bench",'seated',300,120,'Reserved seating behind the shooting line'),('Archer slot','participant',350,24,'Enter the contest · one competitor')]),
    ('The Victor’s Feast', 'victors-feast', 'Feast', 'feast', '2027-03-20',
     'As the banners fall, the celebration begins. Take your place at candlelit long tables for an evening of music, stories, and a feast fit for the champions of the realm.',
     [('Feast seat','seated',1200,64,'One place at a table of eight · banquet included')]),
    ('Battle of the Five Banners', 'five-banners', 'Grand Melee', 'joust', '2027-02-27',
     'Five houses. One field. A grand display of teamwork, heraldry, and choreographed battle beneath the winter sky. This gathering is fully booked.',
     [('Commoner’s Bench','counted',450,80,'Field-side general admission')]),
]


def add_seats(db, tier_id, count, layout, start_index=0):
    width = 8 if layout == 'tables' else 10
    tier = db.execute('SELECT name FROM ticket_tiers WHERE id=?', (tier_id,)).fetchone()
    section = 'Royal' if 'Royal' in tier['name'] else ('Noble' if 'Noble' in tier['name'] else 'Bench')
    for index in range(start_index, start_index + count):
        row = f'Table {index // width + 1}' if layout == 'tables' else row_label(index // width)
        db.execute('INSERT INTO seats (tier_id,section,row,number) VALUES (?,?,?,?)', (tier_id, section, row, index % width + 1))


def row_label(index):
    label=''
    index+=1
    while index:
        index,remainder=divmod(index-1,26)
        label=chr(65+remainder)+label
    return label


def row_index(label):
    value=0
    for char in label:
        value=value*26+ord(char)-64
    return value-1


def seed_demo():
    with transaction() as db:
        if db.execute('SELECT COUNT(*) FROM events').fetchone()[0]:
            return False
        venues = [('The Royal Lists','Silverlance Grounds · Intramuros','stands'),('The Iron Colosseum','Arena District · Manila','arena'),('The King’s Green','Royal Gardens · Quezon City','stands'),('The Great Hall','Castle Courtyard · Intramuros','tables')]
        for name, location, layout in venues:
            db.execute('INSERT INTO venues (name,location,layout_type) VALUES (?,?,?)', (name,location,layout))
        for index, (title, slug, category, image, date, description, tiers) in enumerate(EVENTS):
            venue_id = min(index + 1, 4) if index < 4 else 1
            hour = '18:00' if image == 'feast' else '14:00'
            start = stamp(f'{date}T{hour}')
            schedule = [('Gates open','13:00'),('Opening procession','14:00'),('The main event','14:30'),('Closing ceremony','17:00')]
            if image == 'feast':
                schedule = [('Doors open','17:30'),('Welcome toast','18:00'),('The feast begins','18:30'),('Music and merriment','20:00')]
            event_id = db.execute('''INSERT INTO events (venue_id,title,slug,category,description,image,start_at,end_at,schedule)
                VALUES (?,?,?,?,?,?,?,?,?)''', (venue_id,title,slug,category,description,image,start,start+14400,json.dumps(schedule))).lastrowid
            for name, kind, price, capacity, perks in tiers:
                tier_id = db.execute('''INSERT INTO ticket_tiers (event_id,name,kind,price,capacity,remaining,perks,max_per_order)
                    VALUES (?,?,?,?,?,?,?,?)''', (event_id,name,kind,price*100,capacity,capacity,perks,1 if kind=='participant' else 8)).lastrowid
                if kind == 'seated':
                    add_seats(db,tier_id,capacity,venues[venue_id-1][2])
        # Sold-out inventory has a corresponding fictional confirmed order.
        db.execute("INSERT INTO bookings (id,reference_code,event_id,owner_token,buyer_name,email,phone,total,status,kind,created_at,expires_at,confirmed_at) VALUES ('seed-sold-out','TG-DEMO80',5,'seed','Demo Festival Group','demo@example.test','09000000000',3600000,'confirmed','spectator',?,?,?)", (stamp('2026-11-19T12:00'),stamp('2026-11-19T12:10'),stamp('2026-11-19T12:01')))
        tier = db.execute('SELECT id,price,capacity FROM ticket_tiers WHERE event_id=5').fetchone()
        db.execute('INSERT INTO booking_items (booking_id,tier_id,quantity,unit_price) VALUES (?,?,?,?)', ('seed-sold-out',tier['id'],tier['capacity'],tier['price']))
        db.execute('UPDATE ticket_tiers SET remaining=0 WHERE event_id=5')
        return True

