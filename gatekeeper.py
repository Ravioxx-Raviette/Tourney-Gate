"""Opaque booking passes and atomic, organizer-authorized group admission."""
import secrets

GATE_SCHEMA='''CREATE TABLE IF NOT EXISTS gate_passes (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 token TEXT NOT NULL UNIQUE,
 checked_at INTEGER
)'''

def ensure_pass(db,booking_id):
    db.execute('INSERT INTO gate_passes (booking_id,token) VALUES (?,?) ON CONFLICT(booking_id) DO NOTHING',(booking_id,secrets.token_urlsafe(32)))
    return db.execute('SELECT * FROM gate_passes WHERE booking_id=?',(booking_id,)).fetchone()

def qr_svg(token):
    import qrcode
    from qrcode.image.svg import SvgPathFillImage
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,border=4,box_size=8)
    qr.add_data('TG1:'+token);qr.make(fit=True)
    return qr.make_image(image_factory=SvgPathFillImage).to_string(encoding='utf-8')

def gate_result(db,event_id,code,admit=False):
    from inventory import require,booking_data
    from db import now
    require(isinstance(event_id,int) and not isinstance(event_id,bool) and event_id>0,'Choose an event.')
    require(isinstance(code,str) and 0<len(code.strip())<=256,'Enter a QR pass or booking reference.')
    event=db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone()
    require(event is not None,'Event not found.',404)
    if event['status']=='cancelled' or event['end_at']<=now():return {'status':'closed','message':'This event is cancelled or has ended. Admission is closed.'}
    code=code.strip()
    if code.startswith('TG1:'):
        row=db.execute('SELECT b.* FROM bookings b JOIN gate_passes p ON p.booking_id=b.id WHERE p.token=?',(code[4:],)).fetchone()
    else:row=db.execute('SELECT * FROM bookings WHERE reference_code=?',(code.upper(),)).fetchone()
    if row is None:return {'status':'not_found','message':'Pass not found. Check the code or reference.'}
    if row['event_id']!=event_id:return {'status':'wrong_event','message':'This booking belongs to another event. No admission recorded.'}
    if row['status']!='confirmed':return {'status':row['status'],'message':'This booking is '+row['status']+'. Admission is not allowed.'}
    entry=ensure_pass(db,row['id'])
    booking=booking_data(db,row['id'])
    details={'reference':row['reference_code'],'guest':row['buyer_name'],'event':booking['event']['title'],
             'count':sum(i['quantity'] for i in booking['items']),
             'items':[i['tier_name']+' · '+(i['row']+' / Seat '+str(i['number']) if i['seat_id'] else str(i['quantity'])+' ticket(s)') for i in booking['items']]}
    if entry['checked_at'] is not None:return dict(details,status='used',checked_at=entry['checked_at'],message='Already checked in. Do not admit this booking again.')
    if not admit:return dict(details,status='valid',message='Valid group pass. Review the guest count, then confirm admission.')
    stamp=now()
    changed=db.execute('UPDATE gate_passes SET checked_at=? WHERE booking_id=? AND checked_at IS NULL',(stamp,row['id'])).rowcount
    if not changed:return dict(details,status='used',message='Another organizer already checked this booking in.')
    from activity import record_activity
    record_activity(db,'gate.admit','booking',row['id'],after={'event_id':event_id,'checked_at':stamp,'ticket_count':details['count']})
    return dict(details,status='admitted',checked_at=stamp,message='Check-in recorded. Admit this entire group once.')
