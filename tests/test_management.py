import json,sqlite3
import pytest
from conftest import client_with_csrf
from db import get_db,transaction,now
from test_booking import reserve,confirm,seat_payload,BUYER

def identity(client):
 with client.session_transaction() as s:return s['user_id']

def test_roles_and_user_visibility(app,browser,admin):
 user,h=browser;organizer,ah=admin
 owner,oh=client_with_csrf(app,role='owner');staff,sh=client_with_csrf(app,role='staff')
 for c,expected in [(user,403),(staff,403),(organizer,200),(owner,200)]:
  assert c.get('/api/admin/users').status_code==expected
  assert c.get('/api/admin/activity').status_code==expected
 for c,expected in [(user,403),(staff,200),(organizer,200),(owner,200)]:assert c.get('/gate').status_code==expected
 assert staff.get('/api/admin/overview').status_code==403
 listed=organizer.get('/api/admin/users').json['users'];assert {u['role'] for u in listed}=={'user'}
 assert all('password_hash' not in u and 'owner_token' not in u for u in owner.get('/api/admin/users').json['users'])
 target=identity(user)
 assert organizer.put(f'/api/admin/users/{target}/role',json={'role':'admin','reason':'Test'},headers=ah).status_code==403
 assert owner.put(f'/api/admin/users/{target}/role',json={'role':'staff','reason':'Gate team'},headers=oh).status_code==200
 assert user.get('/account').status_code==302  # Role changes revoke old sessions.
 assert owner.put(f'/api/admin/users/{identity(owner)}/status',json={'active':False,'reason':'Not allowed'},headers=oh).status_code==409
 assert organizer.put(f'/api/admin/users/{identity(staff)}/status',json={'active':False,'reason':'Not allowed'},headers=ah).status_code==403

def test_suspension_preserves_tickets_and_profile_but_releases_holds(app,browser,admin):
 user,h=browser;organizer,ah=admin;uid=identity(user)
 confirmed=reserve(user,h,payload=seat_payload(app)).json;assert confirm(user,h,confirmed).status_code==200
 pending=reserve(user,h,payload={'items':[{'tier_id':1,'seat_ids':[2]}]}).json
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':'Support review'},headers=ah).status_code==200
 assert user.get('/account').status_code==302
 with app.app_context():
  db=get_db();assert db.execute('SELECT status FROM bookings WHERE id=?',(confirmed['id'],)).fetchone()['status']=='confirmed'
  assert db.execute('SELECT status FROM seats WHERE id=2').fetchone()['status']=='available'
  assert db.execute('SELECT status FROM bookings WHERE id=?',(pending['id'],)).fetchone()['status']=='expired'
 assert organizer.post('/api/admin/gate/inspect',json={'event_id':1,'code':confirmed['reference_code']},headers=ah).json['status']=='valid'
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':True,'reason':'Review complete'},headers=ah).status_code==200
 assert user.get('/account').status_code==302

def test_gate_staff_admission_is_audited_once(app,browser):
 user,h=browser;staff,sh=client_with_csrf(app,role='staff')
 booking=reserve(user,h,payload=seat_payload(app)).json;confirm(user,h,booking)
 payload={'event_id':1,'code':booking['reference_code']}
 assert staff.post('/api/admin/gate/check-in',json=payload,headers=sh).json['status']=='admitted'
 assert staff.post('/api/admin/gate/check-in',json=payload,headers=sh).json['status']=='used'
 with app.app_context():assert get_db().execute("SELECT COUNT(*) FROM activity_log WHERE action='gate.admit'").fetchone()[0]==1

def test_audit_failure_rolls_back_event_and_suspension(app,browser,admin):
 user,h=browser;organizer,ah=admin;uid=identity(user)
 with app.app_context():get_db().execute("CREATE TRIGGER fail_audit BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
 with pytest.raises(sqlite3.IntegrityError):organizer.post('/api/admin/events/1/cancel',json={},headers=ah)
 with pytest.raises(sqlite3.IntegrityError):organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':'Test'},headers=ah)
 with app.app_context():
  db=get_db();assert db.execute('SELECT status FROM events WHERE id=1').fetchone()['status']=='upcoming'
  assert db.execute('SELECT is_active FROM users WHERE id=?',(uid,)).fetchone()[0]==1

def test_owner_cli_preserves_password_and_protects_owners(app,admin):
 organizer,h=admin;uid=identity(organizer)
 with app.app_context():before=dict(get_db().execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone())
 result=app.test_cli_runner().invoke(args=['promote-owner','--email',before['email']]);assert result.exit_code==0,result.output
 with app.app_context():
  after=get_db().execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
  assert after['role']=='owner' and after['password_hash']==before['password_hash'] and after['owner_token']==before['owner_token']
 assert organizer.get('/admin').status_code==302
 owner,oh=client_with_csrf(app,role='owner')
 assert owner.put(f'/api/admin/users/{uid}/role',json={'role':'user','reason':'Not allowed'},headers=oh).status_code==403

def test_management_validation_csrf_and_audit_payload(app,browser,admin):
 user,h=browser;organizer,ah=admin;uid=identity(user)
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':'Test'}).status_code==403
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':''},headers=ah).status_code==400
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':'false','reason':'Test'},headers=ah).status_code==400
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':'Support review','password':'do-not-log'},headers=ah).status_code==200
 log=organizer.get('/api/admin/activity?action=user.suspend').json
 assert log['total']==1 and log['page_size']==50
 assert 'do-not-log' not in json.dumps(log) and 'password_hash' not in json.dumps(log)
 assert organizer.get('/api/admin/users?status=suspended').json['total']==1


def test_role_migration_preserves_linked_data_and_creates_one_backup(tmp_path):
 from account_schema import ensure_account_schema
 path=tmp_path/'roles.sqlite';db=sqlite3.connect(path,isolation_level=None)
 db.execute('PRAGMA foreign_keys=ON')
 db.executescript("""
 CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','admin')),owner_token TEXT NOT NULL UNIQUE,auth_version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
 INSERT INTO users VALUES(7,'Existing admin','admin@example.test','unchanged-hash','admin','unchanged-owner',4,100);
 CREATE TABLE account_profiles(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,house_json TEXT,itinerary_json TEXT NOT NULL DEFAULT '[]');
 INSERT INTO account_profiles VALUES(7,'{"name":"Saved house"}','[1,2]');
 CREATE TABLE bookings(id TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),created_at INTEGER NOT NULL);
 INSERT INTO bookings VALUES('kept-booking',7,100);
 CREATE TABLE gate_passes(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),token TEXT NOT NULL);
 INSERT INTO gate_passes VALUES('kept-booking','kept-pass');
 """)
 ensure_account_schema(db,path);ensure_account_schema(db,path)
 assert db.execute('SELECT id,password_hash,owner_token,role,auth_version,is_active FROM users').fetchone()==(7,'unchanged-hash','unchanged-owner','admin',4,1)
 assert db.execute('SELECT house_json,itinerary_json FROM account_profiles').fetchone()==('{"name":"Saved house"}','[1,2]')
 assert db.execute('SELECT user_id FROM bookings').fetchone()[0]==7
 assert db.execute('SELECT token FROM gate_passes').fetchone()[0]=='kept-pass'
 assert db.execute('PRAGMA foreign_keys').fetchone()[0]==1
 assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
 backups=list((tmp_path/'backups').glob('pre-roles-*.sqlite'));assert len(backups)==1
 with sqlite3.connect(backups[0]) as backup:
  assert 'is_active' not in [r[1] for r in backup.execute('PRAGMA table_info(users)')]
  assert backup.execute('SELECT user_id FROM bookings').fetchone()[0]==7
 db.execute("UPDATE users SET role='staff' WHERE id=7")
 db.close()


def test_all_event_tier_and_cli_mutations_are_audited(app,admin):
 from test_admin import tier_payload
 from test_accounts import PASSWORD
 organizer,h=admin
 values={'title':'Audit Gathering','slug':'audit-gathering','category':'Feast','venue_id':4,'description':'A fictional feast.','image':'feast','start_at':'2027-05-01T18:00','end_at':'2027-05-01T22:00','schedule':[['Gates open','17:30']]}
 result=organizer.post('/api/admin/events',json=values,headers=h);assert result.status_code==201
 eid=result.json['id'];values['title']='Audited Gathering'
 assert organizer.put(f'/api/admin/events/{eid}',json=values,headers=h).status_code==200
 assert organizer.post(f'/api/admin/events/{eid}/tiers',json=tier_payload(10),headers=h).status_code==200
 with app.app_context():tid=get_db().execute('SELECT id FROM ticket_tiers WHERE event_id=?',(eid,)).fetchone()[0]
 assert organizer.put(f'/api/admin/tiers/{tid}',json=tier_payload(12),headers=h).status_code==200
 assert organizer.post(f'/api/admin/events/{eid}/cancel',json={},headers=h).status_code==200
 assert organizer.post(f'/api/admin/events/{eid}/cancel',json={},headers=h).status_code==200
 runner=app.test_cli_runner()
 assert runner.invoke(args=['create-admin','--email','new-admin@example.test','--name','New admin'],input=PASSWORD+'\n'+PASSWORD+'\n').exit_code==0
 assert runner.invoke(args=['reset-password','--email','new-admin@example.test'],input=PASSWORD+'\n'+PASSWORD+'\n').exit_code==0
 entries=organizer.get('/api/admin/activity').json['entries'];actions=[e['action'] for e in entries]
 assert set(actions)=={'event.create','event.update','tier.create','tier.update','event.cancel','account.create','account.password_reset'}
 assert actions.count('event.cancel')==1
 assert all(e['actor_id']==identity(organizer) for e in entries if e['action'].startswith(('event.','tier.')))
 assert all(e['actor_role']=='local_cli' for e in entries if e['action'].startswith('account.'))


def test_suspended_login_and_restored_profile(app,admin):
 from test_accounts import anonymous,register,login,csrf,HOUSE
 user,_=anonymous(app);register(user);uid=identity(user)
 user.post('/house',data={**HOUSE,'csrf_token':csrf(user)['X-CSRF-Token']})
 user.post('/itinerary/add',data={'event_id':'1','csrf_token':csrf(user)['X-CSRF-Token']})
 organizer,h=admin
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':False,'reason':'Test suspension'},headers=h).status_code==200
 assert login(user).status_code==403
 assert user.post('/api/events/1/reservations',json=seat_payload(app),headers=csrf(user)).status_code==401
 assert organizer.put(f'/api/admin/users/{uid}/status',json={'active':True,'reason':'Test restoration'},headers=h).status_code==200
 assert login(user).status_code==302
 assert b'House Ember' in user.get('/house').data
 assert b'Tourney of the Silver Lance' in user.get('/itinerary').data


def test_users_and_activity_pagination_and_filters(app,admin):
 organizer,h=admin
 with app.app_context(),transaction() as db:
  from activity import record_activity
  for i in range(52):
   cursor=db.execute("INSERT INTO users(name,email,password_hash,role,owner_token,created_at) VALUES (?,?,?,'user',?,?)",(f'Paged {i}',f'paged{i}@example.test','never-login',f'paged-owner-{i}',now()))
   record_activity(db,'user.suspend','user',cursor.lastrowid,after={'is_active':0},actor={'id':identity(organizer),'name':'Filter Actor','email':'filter@example.test','role':'admin'})
 first=organizer.get('/api/admin/users?q=paged').json;second=organizer.get('/api/admin/users?q=paged&page=2').json
 assert first['total']==52 and len(first['users'])==50 and len(second['users'])==2
 assert not {u['id'] for u in first['users']} & {u['id'] for u in second['users']}
 result=organizer.get('/api/admin/activity?actor=Filter&action=user.suspend&page=2').json
 assert result['total']==52 and len(result['entries'])==2
 assert organizer.get('/api/admin/activity?to=2000-01-01').json['total']==0
 assert organizer.get('/api/admin/activity?from=bad-date').status_code==400
 assert organizer.get('/api/admin/users?page=-1').status_code==400


def test_staff_cannot_access_other_administration(app,browser):
 staff,h=client_with_csrf(app,role='staff');user,_=browser
 for path in ['/admin','/admin/users','/admin/activity','/api/admin/overview','/api/admin/users','/api/admin/activity']:
  assert staff.get(path).status_code==403
 for method,path,data in [('post','/api/admin/events',{}),('put','/api/admin/events/1',{}),('post','/api/admin/events/1/cancel',{}),('post','/api/admin/events/1/tiers',{}),('put','/api/admin/tiers/1',{}),('put',f'/api/admin/users/{identity(user)}/status',{'active':False,'reason':'Not allowed'}),('put',f'/api/admin/users/{identity(user)}/role',{'role':'admin','reason':'Not allowed'})]:
  assert getattr(staff,method)(path,json=data,headers=h).status_code==403


@pytest.mark.parametrize('gate', [False,True])
def test_revocation_between_request_guard_and_transaction(app,admin,browser,monkeypatch,gate):
 import app as app_module
 from contextlib import contextmanager
 user,h=browser
 booking=reserve(user,h,payload=seat_payload(app)).json;confirm(user,h,booking)
 actor,headers=client_with_csrf(app,role='staff') if gate else admin
 uid=identity(actor);original=app_module.transaction
 @contextmanager
 def revoke_then_lock():
  # Simulate another request committing revocation after load_current_user read.
  with sqlite3.connect(app.config['DATABASE']) as db:
   db.execute('UPDATE users SET is_active=0,auth_version=auth_version+1 WHERE id=?',(uid,))
  with original() as db:yield db
 monkeypatch.setattr(app_module,'transaction',revoke_then_lock)
 response=actor.post('/api/admin/gate/check-in' if gate else '/api/admin/events/1/cancel',json={'event_id':1,'code':booking['reference_code']} if gate else {},headers=headers)
 assert response.status_code==401
 with app.app_context():
  db=get_db()
  assert db.execute('SELECT status FROM events WHERE id=1').fetchone()[0]=='upcoming'
  assert db.execute('SELECT checked_at FROM gate_passes WHERE booking_id=?',(booking['id'],)).fetchone()[0] is None
  assert db.execute('SELECT COUNT(*) FROM activity_log').fetchone()[0]==0



def test_suspension_cannot_race_new_reservation(app,browser,monkeypatch):
 import inventory
 from contextlib import contextmanager
 user,headers=browser;uid=identity(user);original=inventory.transaction
 @contextmanager
 def suspend_then_lock():
  with sqlite3.connect(app.config['DATABASE']) as db:
   db.execute('UPDATE users SET is_active=0,auth_version=auth_version+1 WHERE id=?',(uid,))
  with original() as db:yield db
 monkeypatch.setattr(inventory,'transaction',suspend_then_lock)
 response=reserve(user,headers,payload=seat_payload(app))
 assert response.status_code==401
 with app.app_context():assert get_db().execute("SELECT COUNT(*) FROM bookings WHERE user_id=? AND status='pending'",(uid,)).fetchone()[0]==0
