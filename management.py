"""Organizer user management, owner provisioning, and read-only activity history."""
import json
from datetime import datetime,timedelta,timezone
import click
from flask import g,request,jsonify,render_template
from accounts import admin_required,owner_required,normalize_email
from db import transaction,expire_holds,now
from inventory import require,BookingError
from activity import record_activity

USER_FIELDS='id,name,email,role,is_active,created_at,suspended_at,suspension_reason'
def payload():
 data=request.get_json(silent=True);require(isinstance(data,dict),'Send a valid JSON object.');return data
def reason_for(data):
 reason=data.get('reason');require(isinstance(reason,str) and 3<=len(reason.strip())<=500,'Enter a reason between 3 and 500 characters.');return reason.strip()
def page_number():
 raw=request.args.get('page','1');require(raw.isascii() and raw.isdigit() and 1<=int(raw)<=100000,'Choose a valid page.');return int(raw)
def target_and_actor(db,user_id,owner_only=False):
 actor=db.execute('SELECT * FROM users WHERE id=?',(g.current_user['id'],)).fetchone()
 require(actor and actor['is_active'] and actor['auth_version']==g.current_user['auth_version'],'Sign in again to continue.',401)
 require(actor['role'] in (('owner',) if owner_only else ('admin','owner')),'Insufficient permissions.',403)
 target=db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone();require(target is not None,'Account not found.',404)
 require(target['id']!=actor['id'],'You cannot change your own role or account status here.',409)
 require(target['role']!='owner','Owner accounts are protected. Use local owner administration.',403)
 require(actor['role']=='owner' or target['role']=='user','Organizers can manage regular users only.',403)
 return actor,target

def install_management(app):
 @app.get('/admin/users')
 @admin_required
 def manage_users_page():return render_template('management.html',activity=False)

 @app.get('/admin/activity')
 @admin_required
 def activity_page():return render_template('management.html',activity=True)

 @app.get('/api/admin/users')
 @admin_required
 def list_users():
  page=page_number();q=request.args.get('q','').strip()[:100];role=request.args.get('role','');status=request.args.get('status','')
  require(role in ('','user','staff','admin','owner') and status in ('','active','suspended'),'Invalid filter.')
  conditions=[];params=[]
  if g.current_user['role']=='admin':conditions.append("role='user'")
  if role:conditions.append('role=?');params.append(role)
  if status:conditions.append('is_active=?');params.append(1 if status=='active' else 0)
  if q:conditions.append('(name LIKE ? OR email LIKE ?)');params.extend(['%'+q+'%']*2)
  where=' WHERE '+' AND '.join(conditions) if conditions else ''
  with transaction() as db:
   total=db.execute('SELECT COUNT(*) FROM users'+where,params).fetchone()[0]
   rows=db.execute('SELECT '+USER_FIELDS+' FROM users'+where+' ORDER BY id DESC LIMIT 50 OFFSET ?',params+[(page-1)*50]).fetchall()
  return jsonify(users=[dict(r) for r in rows],total=total,page=page,page_size=50)

 @app.put('/api/admin/users/<int:user_id>/status')
 @admin_required
 def change_user_status(user_id):
  data=payload();reason=reason_for(data);active=data.get('active');require(isinstance(active,bool),'Choose active or suspended.')
  with transaction() as db:
   actor,target=target_and_actor(db,user_id)
   if bool(target['is_active'])!=active:
    db.execute('UPDATE users SET is_active=?,suspended_at=?,suspension_reason=?,auth_version=auth_version+1 WHERE id=?',
      (int(active),None if active else now(),'' if active else reason,user_id))
    if not active:
     db.execute("UPDATE bookings SET expires_at=? WHERE user_id=? AND status='pending' AND expires_at>?",(now(),user_id,now()))
     expire_holds(db)
    after=db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
    record_activity(db,'user.restore' if active else 'user.suspend','user',user_id,target,after,reason,actor)
  return jsonify(ok=True)

 @app.put('/api/admin/users/<int:user_id>/role')
 @owner_required
 def change_user_role(user_id):
  data=payload();reason=reason_for(data);role=data.get('role');require(role in ('user','staff','admin'),'Choose User, Gate Staff, or Admin.')
  with transaction() as db:
   actor,target=target_and_actor(db,user_id,owner_only=True)
   if target['role']!=role:
    db.execute('UPDATE users SET role=?,auth_version=auth_version+1 WHERE id=?',(role,user_id))
    after=db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
    record_activity(db,'user.role_change','user',user_id,target,after,reason,actor)
  return jsonify(ok=True)

 @app.get('/api/admin/activity')
 @admin_required
 def list_activity():
  page=page_number();conditions=[];params=[]
  for field,column in [('actor','actor_name'),('action','action'),('target','target_type')]:
   value=request.args.get(field,'').strip()[:100]
   if value:
    if field=='actor':conditions.append('(actor_name LIKE ? OR actor_email LIKE ?)');params.extend(['%'+value+'%']*2)
    elif field=='target':conditions.append("(target_type || ':' || target_id) LIKE ?");params.append('%'+value+'%')
    else:conditions.append('action=?');params.append(value)
  for field,operator,days in [('from','>=',0),('to','<',1)]:
   value=request.args.get(field,'')
   if value:
    try:stamp=int((datetime.strptime(value,'%Y-%m-%d').replace(tzinfo=timezone(timedelta(hours=8)))+timedelta(days=days)).timestamp())
    except ValueError:raise BookingError('Choose a valid date.')
    conditions.append('created_at '+operator+' ?');params.append(stamp)
  where=' WHERE '+' AND '.join(conditions) if conditions else ''
  with transaction() as db:
   total=db.execute('SELECT COUNT(*) FROM activity_log'+where,params).fetchone()[0]
   rows=db.execute('SELECT * FROM activity_log'+where+' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?',params+[(page-1)*50]).fetchall()
  result=[]
  for row in rows:
   item=dict(row);item['before']=json.loads(item.pop('before_json'));item['after']=json.loads(item.pop('after_json'));result.append(item)
  return jsonify(entries=result,total=total,page=page,page_size=50)

 @app.cli.command('promote-owner')
 @click.option('--email',prompt=True)
 def promote_owner(email):
  try:
   email=normalize_email(email)
   with transaction() as db:
    user=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone();require(user is not None,'Account not found.',404)
    require(user['is_active'],'Restore the account before promoting it.')
    if user['role']!='owner':
     db.execute("UPDATE users SET role='owner',auth_version=auth_version+1 WHERE id=?",(user['id'],))
     after=db.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
     record_activity(db,'user.role_change','user',user['id'],user,after,'Local owner provisioning')
  except BookingError as error:raise click.ClickException(str(error)) from error
  click.echo('Owner access granted. Password unchanged; sign in again.')
