"""SQLite connections and short, serialized inventory transactions."""
import sqlite3
import time
from contextlib import contextmanager
from flask import current_app, g


def now():
    return int(time.time())


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(current_app.config['DATABASE'], timeout=15, isolation_level=None)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
        g.db.execute('PRAGMA busy_timeout = 15000')
    return g.db


def close_db(_error=None):
    connection = g.pop('db', None)
    if connection is not None:
        connection.close()


def expire_holds(db):
    timestamp = now()
    db.execute("UPDATE seats SET status='available', booking_id=NULL WHERE status='held' AND booking_id IN (SELECT id FROM bookings WHERE status='pending' AND expires_at<=?)", (timestamp,))
    db.execute("UPDATE bookings SET status='expired' WHERE status='pending' AND expires_at<=?", (timestamp,))


@contextmanager
def transaction():
    db = get_db()
    db.execute('BEGIN IMMEDIATE')
    try:
        expire_holds(db)
        yield db
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise


def init_db():
    db = get_db()
    db.execute('PRAGMA journal_mode = WAL')
    with current_app.open_resource('schema.sql') as source:
        db.executescript(source.read().decode('utf-8'))

