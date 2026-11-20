"""Repeatable fictional demo data; seeding never resets existing bookings."""
import json
from datetime import datetime, timezone
from db import transaction


def stamp(value):
    return int(datetime.fromisoformat(value + '+08:00').timestamp())


JOUST_TIERS = [
    ('Royal Box', 'seated', 1500, 20, 'Front and center · shaded seating · welcome drink'),
    ('Noble Stand', 'seated', 800, 80, 'Elevated views · reserved numbered seat'),
    ("Commoner’s Bench", 'seated', 350, 200, 'A place in the heart of the crowd'),
    ('Knight slot', 'participant', 500, 16, 'Enter the lists · supervised performance'),
]
MELEE_TIERS = [
    ('Royal Box', 'seated', 1500, 20, 'Front and center · shaded royal pavilion · welcome drink'),
    ('Noble Stand', 'seated', 800, 80, 'Elevated covered gallery · reserved numbered seat'),
    ("Commoner’s Bench", 'seated', 450, 200, 'Open-air stadium bleachers · heart of the crowd'),
]
ARENA_TIERS = [
    ('Noble Stand', 'seated', 900, 60, 'Raised arena seating · excellent sightlines'),
    ("Commoner’s Bench", 'seated', 400, 240, 'Reserved seat around the arena'),
    ('Groundling', 'counted', 200, 150, 'Standing room at the 4 exterior big-screen plazas'),
    ('Gladiator slot', 'participant', 500, 12, 'Supervised staged bouts · one competitor'),
]
ARCHERY_TIERS = [
    ("Commoner’s Bench", 'seated', 300, 120, 'Reserved seating behind the shooting line'),
    ('Archer slot', 'participant', 350, 24, 'Enter the contest · one competitor'),
]
FEAST_TIERS = [
    ('Feast seat', 'seated', 1200, 64, 'One place at a table of eight · banquet included'),
]

# Tuple format: (title, slug, category, image, venue_id, date, hour, schedule, description, tiers)
EVENTS = [
    # ── JOUST (4 events · The Royal Lists · venue_id=1) ──────────────────────
    ('The Tourney of the Silver Lance', 'silver-lance', 'Joust', 'joust', 1, '2027-02-13', '14:00',
     [('Gates open', '13:00'), ('Opening procession', '14:00'), ('The main event', '14:30'), ('Closing ceremony', '17:00')],
     'A clash of courage. A day to remember. Watch the finest knights of the realm ride beneath their house banners in a spectacular tournament of skill, chivalry, and pageantry.',
     JOUST_TIERS),
    ('The Dawn Tilts of Intramuros', 'dawn-tilts', 'Joust', 'joust', 1, '2027-03-13', '10:00',
     [('Gates open', '09:00'), ('Knights’ muster', '10:00'), ('Morning jousting passes', '10:30'), ('Laurel presentation', '13:00')],
     'Crisp morning sunlight over the Royal Lists. Witness early-day cavalry passes, splintered lances, and classic tournament heraldry as rival houses open the spring calendar.',
     JOUST_TIERS),
    ('The Sovereign’s Tilt', 'sovereigns-tilt', 'Joust', 'joust', 1, '2027-04-17', '15:30',
     [('Gates open', '14:30'), ('Royal procession', '15:30'), ('Grand jousting bouts', '16:00'), ('Trophy salute', '18:30')],
     'Trumpets sound across the timber stands as veteran riders vie for the Sovereign’s favor in an afternoon of high-speed charges and ceremonial pageantry.',
     JOUST_TIERS),
    ('The Midsummer Lance', 'midsummer-lance', 'Joust', 'joust', 1, '2027-05-22', '16:30',
     [('Gates open', '15:30'), ('Banner parade', '16:30'), ('Championship tilts', '17:00'), ('Torchlit closing', '19:30')],
     'Golden-hour jousting at its grandest. Watch the season’s top mounted champions thunder down the lists as lanterns ignite along the royal pavilions.',
     JOUST_TIERS),

    # ── GRAND MELEE (4 events · The Royal Lists · venue_id=1) ────────────────
    ('Battle of the Five Banners', 'five-banners', 'Grand Melee', 'joust', 1, '2027-02-27', '14:00',
     [('Gates open', '13:00'), ('Opening procession', '14:00'), ('The main event', '14:30'), ('Closing ceremony', '17:00')],
     'Five houses. One field. A grand display of teamwork, heraldry, and choreographed battle beneath the winter sky.',
     MELEE_TIERS),
    ('The Crownwall Skirmish', 'crownwall-skirmish', 'Grand Melee', 'joust', 1, '2027-03-27', '15:00',
     [('Gates open', '14:00'), ('House muster & arming', '15:00'), ('Shield-wall skirmishes', '15:30'), ('Champions’ salute', '18:00')],
     'Steel meets shield across the Royal Lists as five armored warbands coordinate bold flanking maneuvers, banner rallies, and staged infantry clashes.',
     MELEE_TIERS),
    ('The Twilight Vanguard', 'twilight-vanguard', 'Grand Melee', 'joust', 1, '2027-05-01', '17:00',
     [('Gates open', '16:00'), ('War-horn parade', '17:00'), ('Dusk grand melee', '17:30'), ('Victory horns', '20:00')],
     'Braziers flare along the arena towers as dusk settles over the field. Experience an atmospheric evening melee of polearms, shields, and roaring house loyalty.',
     MELEE_TIERS),
    ('Siege of the Iron Standard', 'iron-standard', 'Grand Melee', 'joust', 1, '2027-06-05', '14:30',
     [('Gates open', '13:30'), ('Oaths of the Five Houses', '14:30'), ('Battle for the Standard', '15:00'), ('Season crowning', '17:30')],
     'The crowning grand melee of the 2027 season. Five houses storm the center line to claim the Iron Standard in a sweeping finale of choreography and grit.',
     MELEE_TIERS),

    # ── GLADIATORIAL GAMES (4 events · The Iron Colosseum · venue_id=2) ──────
    ('Games of the Iron Colosseum', 'iron-colosseum', 'Gladiatorial Games', 'arena', 2, '2027-03-06', '14:00',
     [('Gates open', '13:00'), ('Opening procession', '14:00'), ('The main event', '14:30'), ('Closing ceremony', '17:00')],
     'Step into the roar of the arena. Witness choreographed gladiatorial bouts, daring displays, and the spectacle of the Iron Colosseum. Choose your champion and be part of the story.',
     ARENA_TIERS),
    ('Trials of the Crimson Sand', 'crimson-sand', 'Gladiatorial Games', 'arena', 2, '2027-04-03', '16:00',
     [('Gates open', '15:00'), ('Gladiators’ oath', '16:00'), ('Paired arena duels', '16:30'), ('Laurel crown', '19:00')],
     'Paired weapon masters step onto the sand floor for a fast-paced gauntlet of choreographed sword, trident, and shield exhibitions surrounded by the four Noble Pavilions.',
     ARENA_TIERS),
    ('Night of the Iron Champions', 'iron-champions', 'Gladiatorial Games', 'arena', 2, '2027-05-08', '18:30',
     [('Gates open', '17:30'), ('Torchlit entrance', '18:30'), ('Headline evening bouts', '19:00'), ('Grand finale', '21:30')],
     'The Iron Colosseum comes alive after dark with blazing braziers, dramatic arena spotlights, and live big-screen feeds across all four Groundling viewing plazas.',
     ARENA_TIERS),
    ('The Colosseum Reckoning', 'colosseum-reckoning', 'Gladiatorial Games', 'arena', 2, '2027-06-12', '15:00',
     [('Gates open', '14:00'), ('Arena procession', '15:00'), ('Championship bouts', '15:30'), ('Closing fanfare', '18:00')],
     'The season’s top arena performers return to the sand for an afternoon of championship bouts, theatrical duels, and thunderous crowd cheers.',
     ARENA_TIERS),

    # ── ARCHERY CONTEST (4 events · The King’s Green · venue_id=3) ───────────
    ('The King’s Mark', 'kings-mark', 'Archery Contest', 'archery', 3, '2027-03-20', '14:00',
     [('Gates open', '13:00'), ('Opening procession', '14:00'), ('The main event', '14:30'), ('Closing ceremony', '17:00')],
     'Steady hands. Quiet anticipation. A single perfect shot. Gather behind the shooting line as the realm’s archers compete for the King’s Mark in a celebration of patience and precision.',
     ARCHERY_TIERS),
    ('The Emerald Arrow Open', 'emerald-arrow', 'Archery Contest', 'archery', 3, '2027-04-10', '09:30',
     [('Gates open', '08:30'), ('Bow inspection', '09:30'), ('Qualifying volleys', '10:00'), ('Awards ceremony', '12:30')],
     'Calm morning breezes make for razor-sharp marksmanship on the King’s Green. Watch longbowmen draw in unison from the shooting line toward the triple downrange targets.',
     ARCHERY_TIERS),
    ('The Royal Longbow Cup', 'royal-longbow-cup', 'Archery Contest', 'archery', 3, '2027-05-15', '13:30',
     [('Gates open', '12:30'), ('Archers’ march', '13:30'), ('Precision flights', '14:00'), ('Golden Arrow award', '16:30')],
     'Precision meets poise in the mid-season longbow cup. From the safety of the curved amphitheatre, follow every arrow flight as finalists narrow in on the gold bullseye.',
     ARCHERY_TIERS),
    ('The Solstice Volley', 'solstice-volley', 'Archery Contest', 'archery', 3, '2027-06-19', '15:00',
     [('Gates open', '14:00'), ('Range briefing', '15:00'), ('Grand solstice volley', '15:30'), ('Champion’s mark', '18:00')],
     'Summer sun warms the King’s Green for the season’s culminating archery showcase, featuring synchronized volleys and nerve-wracking single-arrow tiebreakers.',
     ARCHERY_TIERS),

    # ── FEAST (4 events · The Great Hall · venue_id=4) ───────────────────────
    ('The Victor’s Feast', 'victors-feast', 'Feast', 'feast', 4, '2027-03-20', '18:00',
     [('Doors open', '17:30'), ('Welcome toast', '18:00'), ('The feast begins', '18:30'), ('Music and merriment', '20:00')],
     'As the banners fall, the celebration begins. Take your place at candlelit long tables for an evening of music, stories, and a feast fit for the champions of the realm.',
     FEAST_TIERS),
    ('The Candlelight Banquet', 'candlelight-banquet', 'Feast', 'feast', 4, '2027-04-24', '19:00',
     [('Doors open', '18:30'), ('Welcome goblet', '19:00'), ('First hearth course', '19:30'), ('Minstrels & toasts', '21:00')],
     'Dine beneath towering timber rafters and flickering candelabras in The Great Hall. Enjoy a multi-course medieval supper accompanied by lute ballads and hearthside tales.',
     FEAST_TIERS),
    ('The Harvest Table of Houses', 'harvest-table', 'Feast', 'feast', 4, '2027-05-29', '18:30',
     [('Doors open', '18:00'), ('Herald’s welcome', '18:30'), ('Grand roast & courses', '19:00'), ('Tavern songs', '20:30')],
     'Rival banners hang side by side as all five houses gather at the eight oak tables for a warm evening of spiced delicacies, raised goblets, and camaraderie.',
     FEAST_TIERS),
    ('The Crown’s Closing Banquet', 'crowns-banquet', 'Feast', 'feast', 4, '2027-06-26', '19:30',
     [('Doors open', '19:00'), ('Royal welcome toast', '19:30'), ('Closing season banquet', '20:00'), ('Finale & farewell', '21:30')],
     'Raise a final chalice to the 2027 tournament season. Join knights, archers, and guests of honor in The Great Hall for a grand closing supper beside the Royal Dais.',
     FEAST_TIERS),
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


def _insert_event(db, venues_by_id, spec):
    title, slug, category, image, venue_id, date, hour, schedule, description, tiers = spec
    start = stamp(f'{date}T{hour}')
    event_id = db.execute('''INSERT INTO events (venue_id,title,slug,category,description,image,start_at,end_at,schedule)
        VALUES (?,?,?,?,?,?,?,?,?)''', (venue_id, title, slug, category, description, image, start, start + 14400, json.dumps(schedule))).lastrowid
    layout = venues_by_id[venue_id]
    for name, kind, price, capacity, perks in tiers:
        tier_id = db.execute('''INSERT INTO ticket_tiers (event_id,name,kind,price,capacity,remaining,perks,max_per_order)
            VALUES (?,?,?,?,?,?,?,?)''', (event_id, name, kind, price * 100, capacity, capacity, perks, 1 if kind == 'participant' else 8)).lastrowid
        if kind == 'seated':
            add_seats(db, tier_id, capacity, layout)


def seed_demo():
    with transaction() as db:
        if db.execute('SELECT COUNT(*) FROM events').fetchone()[0]:
            return False
        venues = [('The Royal Lists','Silverlance Grounds · Intramuros','stands'),('The Iron Colosseum','Arena District · Manila','arena'),('The King’s Green','Royal Gardens · Quezon City','stands'),('The Great Hall','Castle Courtyard · Intramuros','tables')]
        venues_by_id = {}
        for idx, (name, location, layout) in enumerate(venues, start=1):
            db.execute('INSERT INTO venues (name,location,layout_type) VALUES (?,?,?)', (name,location,layout))
            venues_by_id[idx] = layout
        for spec in EVENTS:
            _insert_event(db, venues_by_id, spec)
        sell_out_demo(db)
        return True


SOLD_OUT_DEMO_SLUG = 'crownwall-skirmish'


def sell_out_demo(db, slug=SOLD_OUT_DEMO_SLUG):
    """Book every spectator place for one event so the catalogue shows a sold-out gathering.

    Participant slots stay open. Safe to run again: it does nothing once the demo booking exists.
    """
    event = db.execute('SELECT id FROM events WHERE slug=?', (slug,)).fetchone()
    booking_id = f'seed-sold-out-{slug}'
    if not event or db.execute('SELECT 1 FROM bookings WHERE id=?', (booking_id,)).fetchone():
        return False
    now = stamp('2026-11-19T12:00')
    tiers = db.execute("SELECT id,kind,price,remaining FROM ticket_tiers WHERE event_id=? AND kind<>'participant'", (event['id'],)).fetchall()
    items, total = [], 0
    for tier in tiers:
        if tier['kind'] == 'seated':
            for seat in db.execute("SELECT id FROM seats WHERE tier_id=? AND status='available'", (tier['id'],)).fetchall():
                items.append((tier['id'], seat['id'], 1, tier['price']))
                total += tier['price']
        elif tier['remaining']:
            items.append((tier['id'], None, tier['remaining'], tier['price']))
            total += tier['price'] * tier['remaining']
    db.execute('''INSERT INTO bookings (id,reference_code,event_id,owner_token,buyer_name,email,phone,total,status,kind,created_at,expires_at,confirmed_at)
        VALUES (?,?,?,?,?,?,?,?,'confirmed','spectator',?,?,?)''',
        (booking_id, 'TG-SOLD' + str(event['id']).zfill(2), event['id'], 'seed', 'Demo Festival Group',
         'demo@example.test', '09000000000', total, now, now + 600, now + 60))
    db.executemany('INSERT INTO booking_items (booking_id,tier_id,seat_id,quantity,unit_price) VALUES (?,?,?,?,?)',
                   [(booking_id, *item) for item in items])
    db.executemany("UPDATE seats SET status='booked' WHERE id=?", [(item[1],) for item in items if item[1]])
    db.executemany('UPDATE ticket_tiers SET remaining=0 WHERE id=?', [(tier['id'],) for tier in tiers])
    return True


def sync_demo_events():
    """Insert any newly added catalog events without altering existing events or bookings."""
    added = 0
    with transaction() as db:
        venues_by_id = {row['id']: row['layout_type'] for row in db.execute('SELECT id, layout_type FROM venues').fetchall()}
        existing = {row['slug'] for row in db.execute('SELECT slug FROM events').fetchall()}
        for spec in EVENTS:
            if spec[1] not in existing:
                _insert_event(db, venues_by_id, spec)
                added += 1
    return added

