PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS venues (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL,
 layout_type TEXT NOT NULL CHECK(layout_type IN ('stands','arena','tables','open'))
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, venue_id INTEGER NOT NULL REFERENCES venues(id),
 title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
 description TEXT NOT NULL, image TEXT NOT NULL DEFAULT 'joust',
 start_at INTEGER NOT NULL, end_at INTEGER NOT NULL CHECK(end_at > start_at),
 schedule TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'upcoming'
 CHECK(status IN ('upcoming','cancelled'))
);
CREATE TABLE IF NOT EXISTS ticket_tiers (
 id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
 name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('seated','counted','participant')),
 price INTEGER NOT NULL CHECK(price >= 0), capacity INTEGER NOT NULL CHECK(capacity >= 0),
 remaining INTEGER NOT NULL CHECK(remaining >= 0 AND remaining <= capacity),
 max_per_order INTEGER NOT NULL DEFAULT 8 CHECK(max_per_order BETWEEN 1 AND 8),
 perks TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY, reference_code TEXT NOT NULL UNIQUE, event_id INTEGER NOT NULL REFERENCES events(id),
 owner_token TEXT NOT NULL, buyer_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL CHECK(total >= 0),
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','cancelled','expired')),
 kind TEXT NOT NULL CHECK(kind IN ('spectator','participant')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, confirmed_at INTEGER
);
CREATE TABLE IF NOT EXISTS seats (
 id INTEGER PRIMARY KEY, tier_id INTEGER NOT NULL REFERENCES ticket_tiers(id),
 section TEXT NOT NULL, row TEXT NOT NULL, number INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','held','booked','retired')),
 booking_id TEXT REFERENCES bookings(id), UNIQUE(tier_id, section, row, number)
);
CREATE TABLE IF NOT EXISTS booking_items (
 id INTEGER PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id),
 tier_id INTEGER NOT NULL REFERENCES ticket_tiers(id), seat_id INTEGER REFERENCES seats(id),
 quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
 participant_legal_name TEXT, participant_persona TEXT, participant_faction TEXT,
 participant_class TEXT, waiver_accepted_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_bookings_expiry ON bookings(status, expires_at);
CREATE INDEX IF NOT EXISTS ix_items_tier ON booking_items(tier_id, booking_id);
CREATE INDEX IF NOT EXISTS ix_seats_tier ON seats(tier_id, status);

