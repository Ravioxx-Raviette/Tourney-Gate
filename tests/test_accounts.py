import re
from pathlib import Path
import sqlite3
from werkzeug.security import check_password_hash
from db import get_db, transaction, now
from test_booking import seat_payload, BUYER

PASSWORD='test-account-password-123'
HOUSE={'name':'House Ember','motto':'By courage, we rise.','crest':'stag','palette':'crimson'}

def anonymous(app):
 c=app.test_client();c.get('/')
 return c,csrf(c)

def csrf(c):
 with c.session_transaction() as s:return {'X-CSRF-Token':s['csrf']}

def register(c,email='person@example.test',**extra):
 return c.post('/register',data={'name':'Demo Person','email':email,'password':PASSWORD,'password_confirm':PASSWORD,'csrf_token':csrf(c)['X-CSRF-Token'],**extra})

def login(c,email='person@example.test',password=PASSWORD,**extra):
 return c.post('/login',data={'email':email,'password':password,'csrf_token':csrf(c)['X-CSRF-Token'],**extra})

def test_registration_hash_role_csrf_and_duplicate_email(app):
 c,_=anonymous(app)
 assert c.post('/register',data={}).status_code==403
 assert register(c,password='short',password_confirm='short').status_code==400
 assert register(c,email=' PERSON@EXAMPLE.TEST ',role='admin').status_code==302
 with app.app_context():
  u=get_db().execute('SELECT * FROM users').fetchone()
  assert u['email']=='person@example.test' and u['role']=='user'
  assert u['password_hash']!=PASSWORD and check_password_hash(u['password_hash'],PASSWORD)
 assert c.get('/account').status_code==200
 other,_=anonymous(app);assert register(other).status_code==400
 assert b'test-account-password' not in other.get('/register').data

def test_public_browsing_private_booking_and_legacy_admin_flag(app):
 c,h=anonymous(app)
 for path in ['/','/events','/events/silver-lance'] :assert c.get(path).status_code==200
 r=c.get('/events/silver-lance/seats');assert r.status_code==302 and '/login?' in r.location
 assert c.post('/api/events/1/reservations',json=seat_payload(app),headers=h).status_code==401
 with c.session_transaction() as s:s['admin']=True
 assert c.get('/api/admin/overview').status_code==401
 assert register(c).status_code==302
 assert c.get('/admin').status_code==403
 assert c.get('/api/admin/overview').status_code==403

def test_login_logout_safe_redirect_and_profile_import(app):
 c,h=anonymous(app)
 c.post('/house',data={**HOUSE,'csrf_token':h['X-CSRF-Token']})
 c.post('/itinerary/add',data={'event_id':'1','csrf_token':h['X-CSRF-Token']})
 assert register(c,next='//evil.example').location.endswith('/account')
 old=csrf(c)['X-CSRF-Token'];assert c.post('/logout',data={'csrf_token':old}).status_code==302
 with c.session_transaction() as s:
  assert 'user_id' not in s and 'house' not in s and 'itinerary' not in s and s['csrf']!=old
 assert login(c,password='incorrect').status_code==401
 assert login(c,next='/events/silver-lance/seats').location.endswith('/events/silver-lance/seats')
 assert b'House Ember' in c.get('/house').data
 assert b'Tourney of the Silver Lance' in c.get('/itinerary').data

def test_booking_account_ownership_and_cross_browser_profiles(app):
 a,_=anonymous(app);register(a)
 booking=a.post('/api/events/1/reservations',json=seat_payload(app),headers=csrf(a)).json
 assert a.post('/api/reservations/'+booking['id']+'/confirm',json=BUYER,headers=csrf(a)).status_code==200
 a.post('/house',data={**HOUSE,'csrf_token':csrf(a)['X-CSRF-Token']})
 a.post('/itinerary/add',data={'event_id':'1','csrf_token':csrf(a)['X-CSRF-Token']})
 b,_=anonymous(app);login(b)
 assert b.get('/api/reservations/'+booking['id']).status_code==200
 assert booking['reference_code'].encode() in b.get('/account').data
 assert b'House Ember' in b.get('/house').data
 assert b'Tourney of the Silver Lance' in b.get('/itinerary').data
 other,_=anonymous(app);register(other,'other@example.test')
 assert other.get('/api/reservations/'+booking['id']).status_code==403
 assert other.post('/api/bookings/lookup',json={'email':BUYER['email'],'reference':booking['reference_code']},headers=csrf(other)).status_code==404
 assert other.post('/api/bookings/'+booking['id']+'/cancel',json={},headers=csrf(other)).status_code==403
 other.get('/house')
 with other.session_transaction() as state:assert state.get('house') is None

def test_database_throttle_cannot_be_reset_by_new_cookie(app):
 c,_=anonymous(app);register(c);c.post('/logout',data={'csrf_token':csrf(c)['X-CSRF-Token']})
 for _ in range(5):assert login(c,password='wrong').status_code==401
 other,_=anonymous(app);assert login(other).status_code==429
 with app.app_context(),transaction() as db:db.execute('UPDATE auth_attempts SET blocked_until=0,window_start=?',(now()-901,))
 assert login(other).status_code==302

def test_admin_cli_reset_invalidates_sessions_and_role_is_loaded_from_database(app):
 runner=app.test_cli_runner()
 result=runner.invoke(args=['create-admin','--email','admin@example.test','--name','Organizer'],input=PASSWORD+'\n'+PASSWORD+'\n')
 assert result.exit_code==0,result.output
 c,_=anonymous(app);assert login(c,'admin@example.test').status_code==302
 assert c.get('/admin').status_code==200
 with app.app_context(),transaction() as db:db.execute("UPDATE users SET role='user' WHERE email='admin@example.test'")
 assert c.get('/admin').status_code==403
 result=runner.invoke(args=['reset-password','--email','admin@example.test'],input='another-secure-password\nanother-secure-password\n')
 assert result.exit_code==0,result.output
 assert c.get('/account').status_code==302

def test_migration_backup_idempotency_and_legacy_records(app,tmp_path):
 from account_schema import ensure_account_schema
 path=tmp_path/'legacy.sqlite'
 import shutil
 shutil.copyfile(Path(__file__).resolve().parents[1]/'database/tourney-gate.sqlite',path)
 con=sqlite3.connect(path);before=con.execute('SELECT COUNT(*) FROM events').fetchone()[0]
 ensure_account_schema(con,path,backup=True);ensure_account_schema(con,path,backup=True)
 assert con.execute('SELECT COUNT(*) FROM events').fetchone()[0]==before
 assert 'user_id' in [r[1] for r in con.execute('PRAGMA table_info(bookings)')]
 assert len(list((tmp_path/'backups').glob('*.sqlite')))==1
 con.close()

def test_expired_session_and_csrf_rotation(app,monkeypatch):
 import time
 from itsdangerous import TimestampSigner
 c,h=anonymous(app);register(c)
 assert c.post('/itinerary/clear',data={'csrf_token':h['X-CSRF-Token']}).status_code==403
 stamp=int(time.time())+9*3600
 monkeypatch.setattr(TimestampSigner,'get_timestamp',lambda self:stamp)
 assert c.get('/account').status_code==302

def test_existing_guest_booking_is_not_assigned_by_email_and_lookup_is_retired(app):
 from inventory import reserve,confirm
 with app.app_context():
  legacy=reserve(1,seat_payload(app),'legacy-owner')
  confirmed=confirm(legacy['id'],BUYER,'legacy-owner')
 c,_=anonymous(app);register(c,BUYER['email'])
 assert confirmed['reference_code'].encode() not in c.get('/account').data
 assert c.post('/api/bookings/lookup',json={'email':BUYER['email'],'reference':confirmed['reference_code']},headers=csrf(c)).status_code==404
 assert c.get('/ticket/'+confirmed['reference_code']).status_code==403
 # Access already granted to an older session remains valid without a new lookup.
 legacy_client,_=anonymous(app)
 with legacy_client.session_transaction() as state:state['booking_access']=[legacy['id']]
 assert legacy_client.get('/ticket/'+confirmed['reference_code']).status_code==200
 with app.app_context():assert get_db().execute('SELECT user_id FROM bookings WHERE id=?',(legacy['id'],)).fetchone()['user_id'] is None


def test_activity_cannot_extend_the_eight_hour_authentication_limit(app):
 c,_=anonymous(app);register(c)
 with c.session_transaction() as state:state['authenticated_at']=now()-8*3600-1
 assert c.get('/account').status_code==302
 with c.session_transaction() as state:assert 'user_id' not in state


def test_returning_login_discards_guest_draft_without_overwriting_account(app):
 c,_=anonymous(app);register(c)
 c.post('/house',data={**HOUSE,'csrf_token':csrf(c)['X-CSRF-Token']})
 c.post('/itinerary/add',data={'event_id':'1','csrf_token':csrf(c)['X-CSRF-Token']})
 c.post('/logout',data={'csrf_token':csrf(c)['X-CSRF-Token']})
 c.post('/house',data={**HOUSE,'name':'House Guest Draft','csrf_token':csrf(c)['X-CSRF-Token']})
 c.post('/itinerary/add',data={'event_id':'2','csrf_token':csrf(c)['X-CSRF-Token']})
 assert login(c).status_code==302
 with c.session_transaction() as state:
  assert state['house']==HOUSE and state['itinerary']==[1]


def test_second_browser_can_update_confirm_and_release_pending_reservations(app):
 a,_=anonymous(app);register(a)
 pending=a.post('/api/events/1/reservations',json=seat_payload(app),headers=csrf(a)).json
 b,_=anonymous(app);login(b)
 assert b.put('/api/reservations/'+pending['id'],json={'items':[{'tier_id':1,'seat_ids':[2]}]},headers=csrf(b)).status_code==200
 assert b.post('/api/reservations/'+pending['id']+'/confirm',json=BUYER,headers=csrf(b)).status_code==200
 another=a.post('/api/events/1/reservations',json=seat_payload(app),headers=csrf(a)).json
 assert b.delete('/api/reservations/'+another['id'],headers=csrf(b)).status_code==200
 with app.app_context():
  assert get_db().execute('SELECT status FROM seats WHERE id=1').fetchone()['status']=='available'
  assert get_db().execute('SELECT status FROM seats WHERE id=2').fetchone()['status']=='booked'


def test_deleted_account_session_cannot_authenticate_a_reused_sqlite_id(app):
 c,_=anonymous(app);register(c)
 with app.app_context(),transaction() as db:db.execute('DELETE FROM users')
 other,_=anonymous(app);register(other,'replacement@example.test')
 assert c.get('/account').status_code==302
