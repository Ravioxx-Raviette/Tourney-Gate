"""Booking rules. Every state transition happens under BEGIN IMMEDIATE."""
import json
import re
import secrets
import sqlite3
from db import now, transaction


class BookingError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def require(value, message, status=400):
    if not value:
        raise BookingError(message, status)


def text_field(data, key, label, required=True, limit=120):
    value = data.get(key, '')
    require(isinstance(value, str), f'{label} must be text.')
    value = value.strip()
    require(not required or value, f'Enter {label.lower()}.')
    require(len(value) <= limit, f'{label} is too long.')
    return value


def integer(value, label, minimum=0, maximum=1000000):
    require(isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= maximum,
            f'{label} must be a whole number between {minimum} and {maximum}.')
    return value


def tiers_for(db, event_id):
    rows = db.execute('''SELECT t.*, COALESCE((SELECT SUM(i.quantity) FROM booking_items i
        JOIN bookings b ON b.id=i.booking_id WHERE i.tier_id=t.id AND b.status='pending'),0) held
        FROM ticket_tiers t WHERE t.event_id=? ORDER BY t.id''', (event_id,)).fetchall()
    return [dict(row, available=row['remaining'] - row['held'], sold=row['capacity'] - row['remaining']) for row in rows]


def event_data(db, event_id, seats=False):
    row = db.execute('''SELECT e.*, v.name venue, v.location, v.layout_type FROM events e
                        JOIN venues v ON e.venue_id=v.id WHERE e.id=?''', (event_id,)).fetchone()
    require(row is not None, 'Event not found.', 404)
    event = dict(row)
    event['tiers'] = tiers_for(db, event_id)
    event['schedule'] = json.loads(event['schedule'])
    if event['status'] != 'cancelled':
        event['status'] = 'past' if event['end_at'] <= now() else ('sold_out' if all(t['remaining'] == 0 for t in event['tiers']) else 'upcoming')
    spectator = [t for t in event['tiers'] if t['kind'] != 'participant']
    event['available'] = sum(t['available'] for t in spectator)
    event['spectator_remaining'] = sum(t['remaining'] for t in spectator)
    event['capacity'] = sum(t['capacity'] for t in spectator)
    event['starting_price'] = min((t['price'] for t in spectator), default=0)
    if seats:
        event['seats'] = [dict(s) for s in db.execute('''SELECT s.id,s.tier_id,s.section,s.row,s.number,s.status
            FROM seats s JOIN ticket_tiers t ON t.id=s.tier_id WHERE t.event_id=? AND s.status<>'retired' ORDER BY s.id''', (event_id,))]
    event['server_time'] = now()
    return event


def booking_data(db, booking_id):
    row = db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone()
    require(row is not None, 'Booking not found.', 404)
    booking = dict(row)
    booking.pop('owner_token')
    booking['items'] = [dict(item) for item in db.execute('''SELECT i.*, t.name tier_name,
        t.kind, s.section,s.row,s.number FROM booking_items i JOIN ticket_tiers t ON t.id=i.tier_id
        LEFT JOIN seats s ON s.id=i.seat_id WHERE i.booking_id=? ORDER BY i.id''', (booking_id,))]
    booking['event'] = event_data(db, booking['event_id'])
    booking['can_cancel'] = booking['status'] == 'confirmed' and booking['event']['start_at'] - now() >= 86400
    booking['server_time'] = now()
    return booking


def owned_booking(db, booking_id, owner):
    row = db.execute('SELECT * FROM bookings WHERE id=? AND owner_token=?', (booking_id, owner)).fetchone()
    require(row is not None, 'Reservation not found in this browser.', 404)
    return row


def assert_event_open(db, event_id):
    event = db.execute('SELECT * FROM events WHERE id=?', (event_id,)).fetchone()
    require(event is not None, 'Event not found.', 404)
    require(event['status'] != 'cancelled', 'This event has been cancelled.', 409)
    require(event['start_at'] > now(), 'Booking for this event has closed.', 409)
    return event


def reserve(event_id, data, owner, booking_id=None):
    with transaction() as db:
        assert_event_open(db, event_id)
        kind = data.get('kind', 'spectator')
        require(kind in ('spectator', 'participant'), 'Choose spectator tickets or participant registration.')
        if booking_id:
            booking = owned_booking(db, booking_id, owner)
            require(booking['status'] == 'pending' and booking['expires_at'] > now(), 'Your reservation has expired. Please select tickets again.', 409)
            require(booking['event_id'] == event_id and booking['kind'] == kind, 'This reservation belongs to a different selection.')
            db.execute("UPDATE seats SET status='available',booking_id=NULL WHERE booking_id=? AND status='held'", (booking_id,))
            db.execute('DELETE FROM booking_items WHERE booking_id=?', (booking_id,))
        else:
            booking_id = secrets.token_hex(16)
            for _ in range(5):
                reference = 'TG-' + ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
                try:
                    db.execute('''INSERT INTO bookings (id,reference_code,event_id,owner_token,total,status,kind,created_at,expires_at)
                        VALUES (?,?,?,?,0,'pending',?,?,?)''', (booking_id, reference, event_id, owner, kind, now(), now()+600))
                    break
                except sqlite3.IntegrityError:
                    continue
            else:
                raise BookingError('Unable to create a reference. Please try again.', 503)
        items = data.get('items')
        require(isinstance(items, list) and 0 < len(items) <= 8, 'Select at least one ticket, up to 8 per order.')
        total_quantity, total_price, seen_tiers = 0, 0, set()
        participant = data.get('participant', {})
        require(isinstance(participant, dict), 'Enter participant details.')
        if kind == 'participant':
            legal = text_field(participant, 'legal_name', 'Legal name')
            persona = text_field(participant, 'persona', 'Persona name')
            faction = text_field(participant, 'faction', 'Faction or house')
            role = text_field(participant, 'class', 'Class or role')
            require(participant.get('waiver') is True, 'Accept the participation waiver to continue.')
        for item in items:
            require(isinstance(item, dict), 'Invalid ticket selection.')
            tier_id = integer(item.get('tier_id'), 'Tier', 1)
            require(tier_id not in seen_tiers, 'Select each tier only once.')
            seen_tiers.add(tier_id)
            tier = db.execute('SELECT * FROM ticket_tiers WHERE id=? AND event_id=?', (tier_id, event_id)).fetchone()
            require(tier is not None, 'Ticket tier not found.', 404)
            require((tier['kind'] == 'participant') == (kind == 'participant'), 'Book spectator tickets and participant slots separately.')
            seat_ids = item.get('seat_ids', [])
            require(isinstance(seat_ids, list), 'Invalid seats.')
            if tier['kind'] == 'seated':
                require(len(seat_ids) == len(set(str(s) for s in seat_ids)), 'A seat can only be selected once.')
                quantity = len(seat_ids)
                require(quantity > 0, 'Choose a seat.')
            else:
                require(not seat_ids, 'This tier does not use numbered seats.')
                quantity = integer(item.get('quantity'), 'Quantity', 1, 8)
            require(quantity <= tier['max_per_order'], f"The limit for {tier['name']} is {tier['max_per_order']} per booking.")
            held = db.execute('''SELECT COALESCE(SUM(i.quantity),0) FROM booking_items i JOIN bookings b ON b.id=i.booking_id
                    WHERE i.tier_id=? AND b.status='pending' ''', (tier_id,)).fetchone()[0]
            require(tier['remaining'] - held >= quantity, 'Those tickets were just reserved or sold out. Please choose another selection.', 409)
            total_quantity += quantity
            require(total_quantity <= (1 if kind == 'participant' else 8), 'Participant registration is one slot per booking.' if kind == 'participant' else 'You can book a maximum of 8 tickets per order.')
            if tier['kind'] == 'seated':
                for seat_id in seat_ids:
                    integer(seat_id, 'Seat', 1)
                    changed = db.execute("UPDATE seats SET status='held',booking_id=? WHERE id=? AND tier_id=? AND status='available'", (booking_id, seat_id, tier_id)).rowcount
                    require(changed == 1, 'That seat was just taken. Please choose another seat.', 409)
                    db.execute('INSERT INTO booking_items (booking_id,tier_id,seat_id,quantity,unit_price) VALUES (?,?,?,1,?)', (booking_id, tier_id, seat_id, tier['price']))
            else:
                db.execute('''INSERT INTO booking_items (booking_id,tier_id,quantity,unit_price,participant_legal_name,
                    participant_persona,participant_faction,participant_class,waiver_accepted_at) VALUES (?,?,?,?,?,?,?,?,?)''',
                    (booking_id, tier_id, quantity, tier['price'], legal if kind == 'participant' else None,
                     persona if kind == 'participant' else None, faction if kind == 'participant' else None,
                     role if kind == 'participant' else None, now() if kind == 'participant' else None))
            total_price += tier['price'] * quantity
        db.execute('UPDATE bookings SET total=? WHERE id=?', (total_price, booking_id))
        return booking_data(db, booking_id)


def confirm(booking_id, data, owner):
    with transaction() as db:
        booking = owned_booking(db, booking_id, owner)
        if booking['status'] == 'confirmed':
            return booking_data(db, booking_id)
        require(booking['status'] == 'pending' and booking['expires_at'] > now(), 'Your reservation has expired. Please select tickets again.', 409)
        assert_event_open(db, booking['event_id'])
        buyer = text_field(data, 'name', 'Full name')
        email = text_field(data, 'email', 'Email', limit=254).lower()
        phone = text_field(data, 'phone', 'Phone number', limit=40)
        require(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email), 'Enter a valid email address.')
        require(re.fullmatch(r'[+()\d\s.\-]{7,40}', phone), 'Enter a valid phone number.')
        require(data.get('simulated_payment') is True, 'Confirm the simulated payment step.')
        groups = db.execute('SELECT tier_id,SUM(quantity) quantity FROM booking_items WHERE booking_id=? GROUP BY tier_id', (booking_id,)).fetchall()
        for item in groups:
            changed = db.execute('UPDATE ticket_tiers SET remaining=remaining-? WHERE id=? AND remaining>=?', (item['quantity'], item['tier_id'], item['quantity'])).rowcount
            require(changed == 1, 'These tickets just sold out. Please select again.', 409)
        db.execute("UPDATE seats SET status='booked' WHERE booking_id=? AND status='held'", (booking_id,))
        db.execute("UPDATE bookings SET status='confirmed',buyer_name=?,email=?,phone=?,confirmed_at=? WHERE id=?", (buyer, email, phone, now(), booking_id))
        return booking_data(db, booking_id)


def release(booking_id, owner):
    with transaction() as db:
        booking = owned_booking(db, booking_id, owner)
        if booking['status'] == 'pending':
            db.execute("UPDATE seats SET status='available',booking_id=NULL WHERE booking_id=? AND status='held'", (booking_id,))
            db.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (booking_id,))
        return booking_data(db, booking_id)


def cancel_in_transaction(db, booking_id):
    booking = db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone()
    if booking['status'] == 'confirmed':
        for item in db.execute('SELECT tier_id,SUM(quantity) quantity FROM booking_items WHERE booking_id=? GROUP BY tier_id', (booking_id,)).fetchall():
            db.execute('UPDATE ticket_tiers SET remaining=remaining+? WHERE id=?', (item['quantity'], item['tier_id']))
    if booking['status'] in ('pending', 'confirmed'):
        db.execute("UPDATE seats SET status='available',booking_id=NULL WHERE booking_id=?", (booking_id,))
        db.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (booking_id,))


def cancel(booking_id):
    with transaction() as db:
        booking = db.execute('SELECT * FROM bookings WHERE id=?', (booking_id,)).fetchone()
        require(booking is not None, 'Booking not found.', 404)
        if booking['status'] == 'cancelled':
            return booking_data(db, booking_id)
        require(booking['status'] == 'confirmed', 'Only confirmed bookings can be cancelled.', 409)
        event = db.execute('SELECT start_at FROM events WHERE id=?', (booking['event_id'],)).fetchone()
        require(event['start_at'] - now() >= 86400, 'Cancellation closes 24 hours before the event.', 409)
        cancel_in_transaction(db, booking_id)
        return booking_data(db, booking_id)

