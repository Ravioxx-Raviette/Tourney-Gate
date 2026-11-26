"""Whitelisted operational history, written by the same transaction as each change."""
import json
import time
from flask import g,has_request_context

FIELDS={
 'user':{'name','email','role','is_active','suspended_at','suspension_reason'},
 'event':{'venue_id','title','slug','category','description','image','start_at','end_at','schedule','status'},
 'tier':{'event_id','name','kind','price','capacity','max_per_order','perks'},
 'booking':{'event_id','checked_at','ticket_count'},
}
def record_activity(db,action,target_type,target_id,before=None,after=None,reason='',actor=None):
 if actor is None and has_request_context():actor=g.get('current_user')
 actor=dict(actor) if actor else {'id':None,'name':'Local command','email':'','role':'local_cli'}
 def clean(value):return {key:val for key,val in dict(value or {}).items() if key in FIELDS[target_type]}
 before,after=clean(before),clean(after)
 if before==after and action not in ('account.password_reset',):return
 db.execute('INSERT INTO activity_log(created_at,actor_id,actor_name,actor_email,actor_role,action,target_type,target_id,reason,before_json,after_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  (int(time.time()),actor['id'],actor['name'],actor['email'],actor['role'],action,target_type,str(target_id),reason,json.dumps(before),json.dumps(after)))
