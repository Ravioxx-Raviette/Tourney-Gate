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
from flask import Flask, abort, jsonify, redirect, render_template, request, session, url_for
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
    )
    if test_config:
        app.config.update(test_config)
    app.teardown_appcontext(close_db)

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

    app.jinja_env.globals['venues_3d'] = VENUES_3D
    app.jinja_env.globals['venue_3d_key'] = venue_3d_key

    @app.context_processor
    def common():
        return dict(current_house=session.get('house'),house_crests=CRESTS,house_palettes=PALETTES,csrf_token=session.get('csrf'), currency=app.config['CURRENCY'], categories=CATEGORIES, venues_3d=VENUES_3D, venue_3d_key=venue_3d_key)

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
        require(row is not None and (row['owner_token']==session['owner'] or booking_id in session.get('booking_access',[])), 'Look up this booking with your email and reference first.',403)
        return row

    def admin_required(function):
        @functools.wraps(function)
        def wrapped(*args,**kwargs):
            if not session.get('admin'):
                if request.path.startswith('/api/'):
                    raise BookingError('Sign in as an organizer to continue.',401)
                return redirect(url_for('admin_login'))
            return function(*args,**kwargs)
        return wrapped

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
        default={'name':'House Ember','motto':'By courage, we rise.','crest':'stag','palette':'crimson'}
        values=session.get('house') or default
        error=None
        if request.method=='POST':
            try:
                session['house']=validate_house(request.form.to_dict())
                session.permanent=True
                return redirect(url_for('house_page',saved='1'))
            except ValueError as problem:
                values=request.form.to_dict()
                error=str(problem)
        return render_template('house.html',house_values=values,house_preview=session.get('house') or default,house_error=error),400 if error else 200

    @app.post('/house/clear')
    def clear_house():
        session.pop('house',None)
        return redirect(url_for('house_page'))

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
    def participant_page(slug):
        with transaction() as db:
            event = event_by_slug(db,slug)
        return render_template('participant.html',event=event)

    @app.get('/checkout/<booking_id>')
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
        return render_template('ticket.html',booking=booking)

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
    def create_reservation(event_id):
        return jsonify(reserve(event_id,body(),session['owner'])),201

    @app.put('/api/reservations/<booking_id>')
    def update_reservation(booking_id):
        data=body()
        with transaction() as db:
            booking=allowed_booking(db,booking_id)
            event_id=booking['event_id']
        return jsonify(reserve(event_id,data,session['owner'],booking_id))

    @app.get('/api/reservations/<booking_id>')
    def reservation_state(booking_id):
        with transaction() as db:
            allowed_booking(db,booking_id)
            return jsonify(booking_data(db,booking_id))

    @app.delete('/api/reservations/<booking_id>')
    def release_reservation(booking_id):
        return jsonify(release(booking_id,session['owner']))

    @app.post('/api/reservations/<booking_id>/confirm')
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
            row=db.execute("SELECT id FROM bookings WHERE email=? AND reference_code=? AND status IN ('confirmed','cancelled')",(email,reference)).fetchone()
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
        error=None
        configured=False
        with transaction() as db:
            setting=db.execute("SELECT value FROM settings WHERE key='admin_hash'").fetchone()
            password_hash=os.environ.get('TOURNEY_ADMIN_HASH') or (setting['value'] if setting else '')
            configured=bool(password_hash)
        if request.method=='POST':
            attempts=session.get('login_attempts',[])
            attempts=[t for t in attempts if t>now()-300]
            if len(attempts)>=5:
                error='Too many attempts. Try again in five minutes.'
            elif password_hash and check_password_hash(password_hash,request.form.get('password','')):
                session['admin']=True
                session['login_attempts']=[]
                session.permanent=True
                return redirect(url_for('admin_page'))
            else:
                session['login_attempts']=attempts+[now()]
                error='The organizer password is incorrect.' if configured else 'Set an organizer password using the setup command in README.md.'
        return render_template('admin_login.html',error=error,configured=configured)

    @app.post('/admin/logout')
    def admin_logout():
        session.pop('admin',None)
        return redirect(url_for('home'))

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
            require(db.execute('SELECT id FROM venues WHERE id=?',(values[0],)).fetchone(),'Choose an existing venue.')
            require(not db.execute('SELECT id FROM events WHERE slug=?',(values[2],)).fetchone(),'That event slug is already in use.')
            event_id=db.execute('INSERT INTO events (venue_id,title,slug,category,description,image,start_at,end_at,schedule) VALUES (?,?,?,?,?,?,?,?,?)',values).lastrowid
            return jsonify(event_data(db,event_id)),201

    @app.put('/api/admin/events/<int:event_id>')
    @admin_required
    def edit_event(event_id):
        values=parse_event(body())
        with transaction() as db:
            event_data(db,event_id)
            require(db.execute('SELECT id FROM venues WHERE id=?',(values[0],)).fetchone(),'Choose an existing venue.')
            require(not db.execute('SELECT id FROM events WHERE slug=? AND id<>?',(values[2],event_id)).fetchone(),'That event slug is already in use.')
            db.execute('UPDATE events SET venue_id=?,title=?,slug=?,category=?,description=?,image=?,start_at=?,end_at=?,schedule=? WHERE id=?',values+(event_id,))
            return jsonify(event_data(db,event_id))

    @app.post('/api/admin/events/<int:event_id>/cancel')
    @admin_required
    def cancel_event(event_id):
        with transaction() as db:
            event_data(db,event_id)
            for row in db.execute("SELECT id FROM bookings WHERE event_id=? AND status IN ('pending','confirmed')",(event_id,)).fetchall():
                cancel_in_transaction(db,row['id'])
            db.execute("UPDATE events SET status='cancelled' WHERE id=?",(event_id,))
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
            return jsonify(event_data(db,event_id))

    @app.cli.command('init-db')
    def init_command():
        init_db()
        click.echo('Database initialized.')

    @app.cli.command('seed-demo')
    def seed_command():
        init_db()
        click.echo('Five fictional events seeded.' if seed_demo() else 'Events already exist; existing data preserved.')

    @app.cli.command('set-admin')
    @click.option('--password',prompt=True,hide_input=True,confirmation_prompt=True)
    def admin_command(password):
        if len(password)<10:
            raise click.ClickException('Use at least 10 characters.')
        init_db()
        with transaction() as db:
            db.execute("INSERT INTO settings (key,value) VALUES ('admin_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(generate_password_hash(password),))
        click.echo('Organizer password configured.')

    return app


app=create_app()

if __name__=='__main__':
    app.run(host='127.0.0.1',port=int(os.environ.get('PORT','5055')),debug=False,threaded=True)

