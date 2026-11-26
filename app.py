from management import install_management
from activity import record_activity
from accounts import install_accounts, login_required, admin_required, gate_required, privileged_actor, persist_profile
from gatekeeper import ensure_pass, qr_svg, gate_result
from flask import Response
from itinerary import plan_days
from flask import flash
"""Tourney Gate local demonstration. Run `python app.py` after initialization."""
from houses import validate_house, CRESTS, PALETTES
import functools
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import click
from flask import g, Flask, abort, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from db import close_db, get_db, init_db, now, transaction
from inventory import (BookingError, assert_event_open, booking_data, cancel, cancel_in_transaction,
                       confirm, event_data, integer, release, require, reserve, text_field, tiers_for)
from seed import add_seats, row_index, seed_demo

MANILA = timezone(timedelta(hours=8))
CATEGORIES = ['Joust','Gladiatorial Games','Archery Contest','Feast','Grand Melee','Festival Day Pass']


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    secret_path = Path(app.instance_path) / 'session-key'
    if not secret_path.exists():
        try:
            with secret_path.open('x') as file:
                file.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    app.config.from_mapping(
        SECRET_KEY=os.environ.get('TOURNEY_SECRET_KEY') or secret_path.read_text().strip(),
        DATABASE=str(Path(app.instance_path) / 'tourney.sqlite'),
        CURRENCY=os.environ.get('TOURNEY_CURRENCY','PHP'),
        SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=os.environ.get('TOURNEY_HTTPS') == '1',
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8), MAX_CONTENT_LENGTH=100000,
        TEMPLATES_AUTO_RELOAD=True, SEND_FILE_MAX_AGE_DEFAULT=0,
    )
    if test_config:
        app.config.update(test_config)
    app.teardown_appcontext(close_db)
    install_accounts(app)
    install_management(app)

    @app.before_request
    def csrf_and_session():
        session.setdefault('csrf', secrets.token_hex(24))
        session.setdefault('owner', secrets.token_hex(24))
        if request.method in ('POST','PUT','PATCH','DELETE'):
            token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token','')
            require(isinstance(token,str) and secrets.compare_digest(token,session['csrf']), 'Your session changed. Refresh the page and try again.', 403)

    @app.after_request
    def response_headers(response):
        # Windows MIME registrations can label .js as text/plain, blocking scripts.
        if request.endpoint == 'static' and response.status_code in (200, 304):
            if request.path.endswith(('.js', '.mjs')):
                response.mimetype = 'text/javascript'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        if not request.path.startswith('/static/'):
            response.headers['Cache-Control'] = 'no-store'
        else:
            response.headers['Cache-Control'] = 'no-cache, must-revalidate'
        return response

    @app.template_filter('money')
    def money(cents):
        symbol = '₱' if app.config['CURRENCY'] == 'PHP' else app.config['CURRENCY'] + ' '
        value = cents / 100
        return symbol + (f'{value:,.0f}' if value.is_integer() else f'{value:,.2f}')

    @app.template_filter('date')
    def date_filter(timestamp, fmt='%d %b %Y'):
        return datetime.fromtimestamp(timestamp, MANILA).strftime(fmt)

    @app.template_filter('stock')
    def stock_filter(tier):
        if tier['remaining']==0:
            return 'Sold out'
        if tier['available']==0:
            return 'Temporarily unavailable'
        prefix='Few left · ' if tier['available']<=tier['capacity']*.1 else ''
        return f"{prefix}{tier['available']} of {tier['capacity']} available"

    CATEGORY_3D_KEY = {
        'Joust': 'silver-lance',
        'Grand Melee': 'five-banners',
        'Gladiatorial Games': 'iron-colosseum',
        'Archery Contest': 'kings-mark',
        'Feast': 'victors-feast',
    }
    VENUES_3D = set(CATEGORY_3D_KEY.values())

    def venue_3d_key(event):
        if not event:
            return None
        slug = event['slug'] if isinstance(event, dict) else getattr(event, 'slug', None)
        if slug in VENUES_3D:
            return slug
        cat = event['category'] if isinstance(event, dict) else getattr(event, 'category', None)
        return CATEGORY_3D_KEY.get(cat)

    def asset_v(filename):
        try:
            return int((Path(app.static_folder) / filename).stat().st_mtime)
        except OSError:
            return 1

    app.jinja_env.globals['venues_3d'] = VENUES_3D
    app.jinja_env.globals['venue_3d_key'] = venue_3d_key
    app.jinja_env.globals['asset_v'] = asset_v

    @app.context_processor
    def common():
        return dict(planned_ids=session.get('itinerary',[]),current_house=session.get('house'),house_crests=CRESTS,house_palettes=PALETTES,csrf_token=session.get('csrf'), currency=app.config['CURRENCY'], categories=CATEGORIES, venues_3d=VENUES_3D, venue_3d_key=venue_3d_key)

    @app.errorhandler(BookingError)
    def booking_error(error):
        if request.path.startswith('/api/'):
            return jsonify(error=str(error)), error.status
        return render_template('error.html', message=str(error), code=error.status), error.status

    @app.errorhandler(404)
    def not_found(_error):
        return render_template('error.html',message='This page has wandered beyond the kingdom.',code=404),404

    @app.errorhandler(sqlite3.OperationalError)
    def database_error(error):
        app.logger.exception('Database operation failed')
        message = 'The box office is busy. Please try again.' if 'locked' in str(error) else 'Initialize the database with the commands in README.md before opening the box office.'
        if request.path.startswith('/api/'):
            return jsonify(error=message),503
        return render_template('error.html',message=message,code=503),503

    def body():
        data = request.get_json(silent=True)
        require(isinstance(data,dict), 'Send a valid JSON object.')
        return data

    def event_by_slug(db, slug, include_seats=False):
        row = db.execute('SELECT id FROM events WHERE slug=?',(slug,)).fetchone()
        require(row is not None,'Event not found.',404)
        return event_data(db,row['id'],include_seats)

    def allowed_booking(db, booking_id):
        row = db.execute('SELECT * FROM bookings WHERE id=?',(booking_id,)).fetchone()
        user=g.get('current_user')
        account_owned = row is not None and row['user_id'] is not None and user and row['user_id']==user['id']
        legacy_owned = row is not None and row['user_id'] is None and (row['owner_token']==session['owner'] or booking_id in session.get('booking_access',[]))
        require(account_owned or legacy_owned, 'This booking is not available to your account. Legacy bookings can be looked up with email and reference.',403)
        return row

    def discovery_data():
        with transaction() as db:
            events = [event_data(db,r['id']) for r in db.execute('SELECT id FROM events ORDER BY start_at,id')]
            venues = [dict(row) for row in db.execute('SELECT * FROM venues ORDER BY id')]
        venue_id = request.args.get('venue', type=int)
        if venue_id not in {venue['id'] for venue in venues}:
            venue_id = None
        filters = dict(search=request.args.get('search','').strip()[:120],
                       category=request.args.get('category','all'),date=request.args.get('date',''),
                       price=request.args.get('price','all'))
        if filters['category'] not in CATEGORIES:
            filters['category']='all'
        if filters['price'] not in ('350','800','1500'):
            filters['price']='all'
        try:
            if filters['date']:
                filters['date']=datetime.strptime(filters['date'],'%Y-%m-%d').strftime('%Y-%m-%d')
        except ValueError:
            filters['date']=''
        matches = [event for event in events if (not venue_id or event['venue_id']==venue_id)
                   and filters['search'].casefold() in event['title'].casefold()
                   and (filters['category']=='all' or event['category']==filters['category'])
                   and (not filters['date'] or date_filter(event['start_at'],'%Y-%m-%d')>=filters['date'])
                   and (filters['price']=='all' or event['starting_price']<=int(filters['price'])*100)]
        return dict(events=events,venues=venues,venue_id=venue_id,filters=filters,matches=matches)

    @app.route('/house',methods=['GET','POST'])
    def house_page():
        # A new visitor starts from a blank banner: no preset name, motto, crest, or colors.
        default={'name':'','motto':'','crest':'','palette':''}
        values=session.get('house') or default
        error=None
        if request.method=='POST':
            try:
                session['house']=validate_house(request.form.to_dict())
                persist_profile('house')
                session.permanent=True
                return redirect(url_for('house_page',saved='1'))
            except ValueError as problem:
                values=request.form.to_dict()
                error=str(problem)
        return render_template('house.html',house_values=values,house_preview=session.get('house') or default,house_error=error),400 if error else 200

    @app.post('/house/clear')
    def clear_house():
        session.pop('house',None)
        persist_profile('house')
        return redirect(url_for('house_page'))

    @app.get('/itinerary')
    def itinerary_page():
        ids=session.get('itinerary',[])
        with transaction() as db:
            events=[event_data(db,row['id']) for row in db.execute('SELECT id FROM events ORDER BY start_at') if row['id'] in ids]
        return render_template('itinerary.html',plan=plan_days(events),missing_count=len(set(ids))-len(events))

    @app.post('/itinerary/<action>')
    def edit_itinerary(action):
        require(action in ('add','remove','clear'),'Unknown planner action.',404)
        ids=list(dict.fromkeys(session.get('itinerary',[])))
        if action=='clear':
            ids=[]
            notice='Your plan has been cleared. Bookings are unchanged.'
        else:
            raw=request.form.get('event_id','')
            require(raw.isascii() and raw.isdigit() and len(raw)<=10,'Choose a valid event.')
            event_id=int(raw)
            if action=='add':
                with transaction() as db:
                    event=event_data(db,event_id)
                require(event['status']!='cancelled' and event['start_at']>now(),'This event is no longer open for planning.',409)
                require(event_id in ids or len(ids)<20,'Your plan can contain up to 20 events.')
                if event_id not in ids:ids.append(event_id)
                notice='Event saved to your plan. No tickets have been reserved.'
            else:
                ids=[id for id in ids if id!=event_id]
                notice='Event removed from your plan. Bookings are unchanged.'
        session['itinerary']=ids
        persist_profile('itinerary')
        session.permanent=True
        flash(notice,'planner')
        return redirect(url_for('itinerary_page'))

    @app.get('/')
    def home():
        data=discovery_data()
        events=data['events']
        upcoming=[event for event in events if event['status']=='upcoming' and event['start_at']>now()]
        venue=next((venue for venue in data['venues'] if venue['id']==data['venue_id']),None)
        return render_template('home.html',**data,selected_venue=venue,
                               venue_events=[event for event in events if event['venue_id']==data['venue_id']],
                               hero=next((event for event in upcoming if event['available']>0),None),
                               upcoming=upcoming,
                               atlas_boot=dict(events=events,venues=data['venues'],selected_venue=data['venue_id']))

    @app.get('/events')
    def events_page():
        return render_template('events.html',**discovery_data())

    @app.get('/events/<slug>')
    def event_page(slug):
        with transaction() as db:
            event = event_by_slug(db,slug)
        return render_template('event.html',event=event)

    @app.get('/events/<slug>/seats')
    @login_required
    def seats_page(slug):
        with transaction() as db:
            event = event_by_slug(db,slug,True)
            edit_id = request.args.get('reservation')
            booking = None
            if edit_id:
                row = allowed_booking(db,edit_id)
                require(row['event_id']==event['id'] and row['kind']=='spectator','Invalid reservation.')
                require(row['status']=='pending','This reservation is no longer active.',409)
                booking = booking_data(db,edit_id)
        return render_template('seats.html',event=event,booking=booking)

    @app.get('/events/<slug>/participate')
    @login_required
    def participant_page(slug):
        with transaction() as db:
            event = event_by_slug(db,slug)
        return render_template('participant.html',event=event)

    @app.get('/checkout/<booking_id>')
    @login_required
    def checkout_page(booking_id):
        with transaction() as db:
            allowed_booking(db,booking_id)
            booking = booking_data(db,booking_id)
        if booking['status']=='confirmed':
            return redirect(url_for('ticket_page',reference=booking['reference_code']))
        return render_template('checkout.html',booking=booking)

    @app.get('/ticket/<reference>')
    def ticket_page(reference):
        with transaction() as db:
            row = db.execute('SELECT id FROM bookings WHERE reference_code=?',(reference.upper(),)).fetchone()
            require(row is not None,'Ticket not found.',404)
            allowed_booking(db,row['id'])
            booking = booking_data(db,row['id'])
            require(booking['status'] in ('confirmed','cancelled'),'This booking has not been confirmed.',409)
            if booking['status']=='confirmed':ensure_pass(db,row['id'])
        return render_template('ticket.html',booking=booking)

    @app.get('/ticket/<reference>/qr.svg')
    def ticket_qr(reference):
        with transaction() as db:
            row=db.execute('SELECT * FROM bookings WHERE reference_code=?',(reference.upper(),)).fetchone()
            require(row is not None,'Ticket not found.',404)
            allowed_booking(db,row['id'])
            require(row['status']=='confirmed','Only confirmed tickets have an entry pass.',409)
            token=ensure_pass(db,row['id'])['token']
        return Response(qr_svg(token),mimetype='image/svg+xml')

    @app.get('/gate')
    @gate_required
    def gate_page():
        with transaction() as db:
            events=[event_data(db,row['id']) for row in db.execute('SELECT id FROM events ORDER BY start_at')]
        return render_template('gate.html',events=events)

    @app.post('/api/admin/gate/<action>')
    @gate_required
    def gate_action(action):
        require(action in ('inspect','check-in'),'Unknown gate action.',404)
        data=body()
        with transaction() as db:
            privileged_actor(db,('staff','admin','owner'))
            result=gate_result(db,data.get('event_id'),data.get('code'),admit=action=='check-in')
        return jsonify(result)

    @app.get('/bookings')
    def bookings_page():
        return render_template('bookings.html')

    @app.get('/api/events')
    def events_api():
        with transaction() as db:
            events = [event_data(db,r['id']) for r in db.execute('SELECT id FROM events ORDER BY start_at')]
        return jsonify(events=events,server_time=now())

    @app.get('/api/events/<int:event_id>/availability')
    def availability(event_id):
        with transaction() as db:
            event = event_data(db,event_id,True)
        return jsonify(event)

    @app.post('/api/events/<int:event_id>/reservations')
    @login_required
    def create_reservation(event_id):
        return jsonify(reserve(event_id,body(),session['owner'],user_id=g.current_user['id'])),201

    @app.put('/api/reservations/<booking_id>')
    @login_required
    def update_reservation(booking_id):
        data=body()
        with transaction() as db:
            booking=allowed_booking(db,booking_id)
            event_id=booking['event_id']
        return jsonify(reserve(event_id,data,session['owner'],booking_id))

    @app.get('/api/reservations/<booking_id>')
    @login_required
    def reservation_state(booking_id):
        with transaction() as db:
            allowed_booking(db,booking_id)
            return jsonify(booking_data(db,booking_id))

    @app.delete('/api/reservations/<booking_id>')
    @login_required
    def release_reservation(booking_id):
        return jsonify(release(booking_id,session['owner']))

    @app.post('/api/reservations/<booking_id>/confirm')
    @login_required
    def confirm_booking(booking_id):
        data=body()
        require(isinstance(data.get('include_house',True),bool),'Choose whether to include your house.')
        if data.get('include_house',True) and 'house_profile' in data:
            data['_reviewed_house']=data['house_profile']
        else:
            data.pop('_reviewed_house',None)
        data['house_profile']=session.get('house') if data.get('include_house',True) else None
        return jsonify(confirm(booking_id,data,session['owner']))

    @app.post('/api/bookings/lookup')
    def lookup_booking():
        data=body()
        email=text_field(data,'email','Email',limit=254).lower()
        reference=text_field(data,'reference','Reference code',limit=20).upper()
        with transaction() as db:
            row=db.execute("SELECT id FROM bookings WHERE email=? AND reference_code=? AND status IN ('confirmed','cancelled') AND (user_id IS NULL OR user_id=?)",(email,reference,g.current_user['id'] if g.get('current_user') else -1)).fetchone()
            require(row is not None,'No booking matches that email and reference code.',404)
            session['booking_access']=(session.get('booking_access',[])+[row['id']])[-20:]
            return jsonify(booking_data(db,row['id']))

    @app.post('/api/bookings/<booking_id>/cancel')
    def cancel_booking(booking_id):
        with transaction() as db:
            allowed_booking(db,booking_id)
        return jsonify(cancel(booking_id))

    @app.route('/admin/login',methods=['GET','POST'])
    def admin_login():
        return redirect(url_for('login',next='/admin'))

    @app.post('/admin/logout')
    def admin_logout():
        return redirect(url_for('logout'),code=307)

    @app.get('/admin')
    @admin_required
    def admin_page():
        with transaction() as db:
            events=[event_data(db,r['id']) for r in db.execute('SELECT id FROM events ORDER BY start_at')]
            venues=[dict(r) for r in db.execute('SELECT * FROM venues')]
        return render_template('admin.html',events=events,venues=venues)

    @app.get('/api/admin/overview')
    @admin_required
    def admin_overview():
        with transaction() as db:
            events=[event_data(db,r['id']) for r in db.execute('SELECT id FROM events ORDER BY start_at')]
            for event in events:
                event['revenue']=db.execute("SELECT COALESCE(SUM(total),0) FROM bookings WHERE event_id=? AND status='confirmed'",(event['id'],)).fetchone()[0]
            bookings=[booking_data(db,r['id']) for r in db.execute("SELECT id FROM bookings WHERE status IN ('confirmed','cancelled') ORDER BY created_at DESC LIMIT 200")]
        return jsonify(events=events,bookings=bookings)

    def parse_event(data):
        title=text_field(data,'title','Title')
        slug=text_field(data,'slug','Slug')
        require(re.fullmatch('[a-z][a-z0-9-]{1,99}',slug),'Use a lowercase slug with letters, numbers, and hyphens.')
        category=text_field(data,'category','Category')
        require(category in CATEGORIES,'Choose a supported category.')
        description=text_field(data,'description','Description',limit=5000)
        venue_id=integer(data.get('venue_id'),'Venue',1)
        image=data.get('image','joust')
        require(image in ('joust','arena','archery','feast'),'Choose an event artwork.')
        try:
            start=int(datetime.fromisoformat(data['start_at']).replace(tzinfo=MANILA).timestamp())
            end=int(datetime.fromisoformat(data['end_at']).replace(tzinfo=MANILA).timestamp())
        except (KeyError,ValueError,TypeError):
            raise BookingError('Enter valid start and end dates.')
        require(end>start,'The event must end after it starts.')
        schedule=data.get('schedule',[])
        require(isinstance(schedule,list) and len(schedule)<=20,'Enter up to 20 schedule entries.')
        clean=[]
        for entry in schedule:
            require(isinstance(entry,list) and len(entry)==2 and all(isinstance(v,str) and len(v)<=100 for v in entry),'Each schedule entry needs a label and time.')
            clean.append(entry)
        return (venue_id,title,slug,category,description,image,start,end,json.dumps(clean))

    @app.post('/api/admin/events')
    @admin_required
    def create_event():
        values=parse_event(body())
        with transaction() as db:
            privileged_actor(db,('admin','owner'))
            require(db.execute('SELECT id FROM venues WHERE id=?',(values[0],)).fetchone(),'Choose an existing venue.')
            require(not db.execute('SELECT id FROM events WHERE slug=?',(values[2],)).fetchone(),'That event slug is already in use.')
            event_id=db.execute('INSERT INTO events (venue_id,title,slug,category,description,image,start_at,end_at,schedule) VALUES (?,?,?,?,?,?,?,?,?)',values).lastrowid
            record_activity(db,'event.create','event',event_id,None,db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone())
            return jsonify(event_data(db,event_id)),201

    @app.put('/api/admin/events/<int:event_id>')
    @admin_required
    def edit_event(event_id):
        values=parse_event(body())
        with transaction() as db:
            privileged_actor(db,('admin','owner'))
            audit_before=dict(db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone() or {})
            event_data(db,event_id)
            require(db.execute('SELECT id FROM venues WHERE id=?',(values[0],)).fetchone(),'Choose an existing venue.')
            require(not db.execute('SELECT id FROM events WHERE slug=? AND id<>?',(values[2],event_id)).fetchone(),'That event slug is already in use.')
            db.execute('UPDATE events SET venue_id=?,title=?,slug=?,category=?,description=?,image=?,start_at=?,end_at=?,schedule=? WHERE id=?',values+(event_id,))
            record_activity(db,'event.update','event',event_id,audit_before,db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone())
            return jsonify(event_data(db,event_id))

    @app.post('/api/admin/events/<int:event_id>/cancel')
    @admin_required
    def cancel_event(event_id):
        with transaction() as db:
            privileged_actor(db,('admin','owner'))
            audit_before=dict(db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone() or {})
            event_data(db,event_id)
            for row in db.execute("SELECT id FROM bookings WHERE event_id=? AND status IN ('pending','confirmed')",(event_id,)).fetchall():
                cancel_in_transaction(db,row['id'])
            db.execute("UPDATE events SET status='cancelled' WHERE id=?",(event_id,))
            record_activity(db,'event.cancel','event',event_id,audit_before,db.execute('SELECT * FROM events WHERE id=?',(event_id,)).fetchone())
            return jsonify(event_data(db,event_id))

    @app.route('/api/admin/events/<int:event_id>/tiers',methods=['POST'])
    @app.route('/api/admin/tiers/<int:tier_id>',methods=['PUT'])
    @admin_required
    def save_tier(event_id=None,tier_id=None):
        data=body()
        name=text_field(data,'name','Tier name')
        kind=data.get('kind')
        require(kind in ('seated','counted','participant'),'Choose a valid ticket type.')
        capacity=integer(data.get('capacity'),'Capacity',0,10000)
        max_order=integer(data.get('max_per_order',1 if kind=='participant' else 8),'Order limit',1,8)
        require(kind!='participant' or max_order==1,'Participant slots use an order limit of 1.')
        try:
            amount=Decimal(str(data.get('price')))
            require(amount.is_finite() and 0<=amount<=100000 and amount.as_tuple().exponent>=-2,'Enter a nonnegative price with up to two decimals.')
            price=int(amount*100)
        except (InvalidOperation,ValueError,TypeError):
            raise BookingError('Enter a valid price.')
        perks=text_field(data,'perks','Perks',required=False,limit=500)
        with transaction() as db:
            privileged_actor(db,('admin','owner'))
            old=db.execute('SELECT * FROM ticket_tiers WHERE id=?',(tier_id,)).fetchone() if tier_id else None
            require(tier_id is None or old is not None,'Tier not found.',404)
            if old:
                event_id=old['event_id']
                require(old['kind']==kind,'Create a new tier to change its ticket type.')
                sold=old['capacity']-old['remaining']
                held=next(t['held'] for t in tiers_for(db,event_id) if t['id']==tier_id)
                require(capacity>=sold+held,'Capacity cannot be below sold plus reserved tickets.',409)
                delta=capacity-old['capacity']
                if kind=='seated' and delta<0:
                    removable=db.execute("SELECT id FROM seats WHERE tier_id=? AND status='available' ORDER BY id DESC LIMIT ?",(tier_id,-delta)).fetchall()
                    require(len(removable)==-delta,'Not enough unreserved seats to reduce capacity.',409)
                    db.executemany("UPDATE seats SET status='retired' WHERE id=?",[(r['id'],) for r in removable])
                db.execute('UPDATE ticket_tiers SET name=?,price=?,capacity=?,remaining=remaining+?,perks=?,max_per_order=? WHERE id=?',(name,price,capacity,delta,perks,max_order,tier_id))
            else:
                delta=capacity
                tier_id=db.execute('INSERT INTO ticket_tiers (event_id,name,kind,price,capacity,remaining,perks,max_per_order) VALUES (?,?,?,?,?,?,?,?)',(event_id,name,kind,price,capacity,capacity,perks,max_order)).lastrowid
            event=event_data(db,event_id)
            if kind=='seated' and delta>0:
                # Continue after the greatest surviving position to avoid duplicate labels after capacity edits.
                existing=db.execute('SELECT row,number FROM seats WHERE tier_id=? ORDER BY id DESC LIMIT 1',(tier_id,)).fetchone()
                width=8 if event['layout_type']=='tables' else 10
                start_index=0
                if existing:
                    previous_row=int(existing['row'].split()[-1])-1 if event['layout_type']=='tables' else row_index(existing['row'])
                    start_index=previous_row*width+existing['number']
                add_seats(db,tier_id,delta,event['layout_type'],start_index)
            record_activity(db,'tier.update' if old else 'tier.create','tier',tier_id,old,db.execute('SELECT * FROM ticket_tiers WHERE id=?',(tier_id,)).fetchone())
            return jsonify(event_data(db,event_id))

    @app.cli.command('init-db')
    def init_command():
        init_db()
        click.echo('Database initialized.')

    @app.cli.command('seed-demo')
    def seed_command():
        init_db()
        click.echo('Demo events seeded.' if seed_demo() else 'Events already exist; existing data preserved.')

    @app.cli.command('sell-out-demo')
    def sell_out_command():
        """Sell out the demo event in an existing database (participant slots stay open)."""
        from seed import sell_out_demo, SOLD_OUT_DEMO_SLUG
        init_db()
        with transaction() as db:
            done = sell_out_demo(db)
        click.echo(f'{SOLD_OUT_DEMO_SLUG} is now sold out.' if done else 'Nothing to change; the demo event is already sold out or missing.')

    @app.cli.command('set-admin')
    def admin_command():
        raise click.ClickException('Use create-admin --email YOUR_EMAIL to provision a role-based admin account.')

    return app


app=create_app()

if __name__=='__main__':
    app.run(host='127.0.0.1',port=int(os.environ.get('PORT','5055')),debug=False,threaded=True)

