"""Versioned SQLite account upgrades with consistent pre-migration backups."""
from pathlib import Path
import secrets
import sqlite3

USERS_SQL='''CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','staff','admin','owner')),
 owner_token TEXT NOT NULL UNIQUE, auth_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), suspended_at INTEGER,
 suspension_reason TEXT NOT NULL DEFAULT ''
);'''
ACCOUNT_SCHEMA=USERS_SQL+'''
CREATE TABLE IF NOT EXISTS account_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,house_json TEXT,itinerary_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS auth_attempts (bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start INTEGER NOT NULL,blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity_log (
 id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 actor_name TEXT NOT NULL, actor_email TEXT NOT NULL, actor_role TEXT NOT NULL,
 action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '', before_json TEXT NOT NULL, after_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_activity_time ON activity_log(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS ix_activity_actor ON activity_log(actor_id,created_at);
CREATE INDEX IF NOT EXISTS ix_activity_action ON activity_log(action,created_at);
'''

def _backup(db,path,prefix):
 folder=Path(path).parent/'backups';folder.mkdir(parents=True,exist_ok=True)
 with sqlite3.connect(folder/(prefix+'-'+secrets.token_hex(8)+'.sqlite')) as copy:db.backup(copy)

def _needs_role_upgrade(db):
 row=db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
 return bool(row and ("'owner'" not in row[0] or 'is_active' not in {r[1] for r in db.execute('PRAGMA table_info(users)')}))

def _upgrade_roles(db):
 # Foreign keys must be toggled outside the transaction. Children keep REFERENCES users.
 db.execute('PRAGMA foreign_keys=OFF')
 try:
  db.execute('BEGIN IMMEDIATE')
  if _needs_role_upgrade(db):
   db.execute(USERS_SQL.replace('IF NOT EXISTS users','users_roles_upgrade'))
   old={r[1] for r in db.execute('PRAGMA table_info(users)')}
   fields=[f for f in ['id','name','email','password_hash','role','owner_token','auth_version','created_at','is_active','suspended_at','suspension_reason'] if f in old]
   columns=','.join(fields)
   db.execute(f'INSERT INTO users_roles_upgrade({columns}) SELECT {columns} FROM users')
   db.execute('DROP TABLE users')
   db.execute('ALTER TABLE users_roles_upgrade RENAME TO users')
   if db.execute('PRAGMA foreign_key_check').fetchall():raise sqlite3.IntegrityError('Account migration foreign-key check failed')
  db.execute('COMMIT')
 except BaseException:
  if db.in_transaction:db.execute('ROLLBACK')
  raise
 finally:db.execute('PRAGMA foreign_keys=ON')

def ensure_account_schema(db,database_path,backup=True):
 bookings=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bookings'").fetchone()
 columns={r[1] for r in db.execute('PRAGMA table_info(bookings)')} if bookings else set()
 users=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
 roles_upgrade=_needs_role_upgrade(db)
 if backup and (roles_upgrade or (bookings and (not users or 'user_id' not in columns))):
  _backup(db,database_path,'pre-roles' if roles_upgrade else 'pre-accounts')
 if roles_upgrade:_upgrade_roles(db)
 db.executescript(ACCOUNT_SCHEMA)
 if bookings and 'user_id' not in columns:
  try:db.execute('ALTER TABLE bookings ADD COLUMN user_id INTEGER REFERENCES users(id)')
  except sqlite3.OperationalError as error:
   if 'duplicate column' not in str(error).lower():raise
 if bookings:db.execute('CREATE INDEX IF NOT EXISTS ix_bookings_user ON bookings(user_id,created_at)')
