"""Local email/password accounts, account profiles and server-enforced roles."""
import functools
import hashlib
import json
import re
import secrets
import sqlite3
from urllib.parse import unquote, urlsplit
import click
from flask import current_app, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db, transaction, now
from houses import validate_house
from inventory import BookingError, booking_data, require

_DUMMY_HASH = generate_password_hash(secrets.token_hex(24))

def safe_next(value, default='/account'):
    if not isinstance(value, str) or len(value)>2048:
        return default
    decoded = value
    for _ in range(3):
        decoded = unquote(decoded)
    try:
        parts = urlsplit(decoded)
    except ValueError:
        return default
    if (not decoded.startswith('/') or decoded.startswith('//') or '\\' in decoded
            or any(ord(c)<32 for c in decoded) or parts.scheme or parts.netloc
            or parts.path in ('/login','/register','/logout','/admin/login','/admin/logout')):
        return default
    return value

def fresh_session():
    session.clear()
    session['csrf'] = secrets.token_hex(24)
    session['owner'] = secrets.token_hex(24)

def load_current_user():
    g.current_user = None
    if request.endpoint == 'static':
        return
    db = get_db()  # Also performs the additive migration for existing installations.
    user_id = session.get('user_id')
    if user_id is None:
        return
    user = db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
    logged_at=session.get('authenticated_at',0)
    valid_age=isinstance(logged_at,(int,float)) and 0<=now()-logged_at<current_app.permanent_session_lifetime.total_seconds()
    same_owner=user and isinstance(session.get('owner'),str) and secrets.compare_digest(session['owner'],user['owner_token'])
    if not user or session.get('auth_version') != user['auth_version'] or not valid_age or not same_owner or not user['is_active']:
        fresh_session()
        return
    g.current_user = user
    session['owner'] = user['owner_token']
    profile = db.execute('SELECT * FROM account_profiles WHERE user_id=?',(user['id'],)).fetchone()
    house = json.loads(profile['house_json']) if profile and profile['house_json'] else None
    itinerary = json.loads(profile['itinerary_json']) if profile else []
    if house:
        session['house'] = house
    else:
        session.pop('house',None)
    session['itinerary'] = itinerary

def login_required(function):
    @functools.wraps(function)
    def wrapped(*args,**kwargs):
        if not g.get('current_user'):
            destination=url_for('login',next=safe_next(request.full_path.rstrip('?'),'/account'))
            if request.path.startswith('/api/'):
                return jsonify(error='Sign in to continue.',login_url=url_for('login')),401
            return redirect(destination)
        return function(*args,**kwargs)
    return wrapped

def admin_required(function):
    @login_required
    @functools.wraps(function)
    def wrapped(*args,**kwargs):
        require(g.current_user['role'] in ('admin','owner'),'This page is available to organizers only.',403)
        return function(*args,**kwargs)
    return wrapped

def gate_required(function):
    @login_required
    @functools.wraps(function)
    def wrapped(*args,**kwargs):
        require(g.current_user['role'] in ('staff','admin','owner'),'Gate staff access is required.',403)
        return function(*args,**kwargs)
    return wrapped

def owner_required(function):
    @login_required
    @functools.wraps(function)
    def wrapped(*args,**kwargs):
        require(g.current_user['role']=='owner','Owner access is required.',403)
        return function(*args,**kwargs)
    return wrapped

def privileged_actor(db, roles=None):
    """Recheck authorization after the transaction write lock is acquired."""
    previous=g.get('current_user')
    actor=db.execute('SELECT * FROM users WHERE id=?',(previous['id'],)).fetchone() if previous else None
    require(actor and actor['is_active'] and actor['auth_version']==previous['auth_version']
            and secrets.compare_digest(actor['owner_token'],previous['owner_token']),
            'Sign in again to continue.',401)
    if roles is not None:
        require(actor['role'] in roles,'Insufficient permissions.',403)
    g.current_user=actor
    return actor


def persist_profile(field):
    user=g.get('current_user')
    if not user:
        return
    column='house_json' if field=='house' else 'itinerary_json'
    value=session.get('house') if field=='house' else session.get('itinerary',[])
    with transaction() as db:
        db.execute('INSERT OR IGNORE INTO account_profiles(user_id) VALUES (?)',(user['id'],))
        db.execute(f'UPDATE account_profiles SET {column}=? WHERE user_id=?',
                   (json.dumps(value) if value is not None else None,user['id']))

def normalize_email(value):
    email=value.strip().lower() if isinstance(value,str) else ''
    require(len(email)<=254 and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email),'Enter a valid email address.')
    return email

def validate_password(password):
    require(isinstance(password,str) and 12<=len(password)<=128,'Use a password between 12 and 128 characters.')
    return password

def insert_user(db,name,email,password,role='user'):
    require(isinstance(name,str) and 2<=len(name.strip())<=80,'Enter a name between 2 and 80 characters.')
    email=normalize_email(email)
    password=validate_password(password)
    cursor=db.execute('INSERT INTO users(name,email,password_hash,role,owner_token,created_at) VALUES (?,?,?,?,?,?)',
                     (name.strip(),email,generate_password_hash(password),role,secrets.token_hex(24),now()))
    db.execute('INSERT INTO account_profiles(user_id) VALUES (?)',(cursor.lastrowid,))
    return db.execute('SELECT * FROM users WHERE id=?',(cursor.lastrowid,)).fetchone()

def establish_login(user):
    fresh_session()
    session['user_id']=user['id']
    session['auth_version']=user['auth_version']
    session['authenticated_at']=now()
    session['owner']=user['owner_token']
    session.permanent=True
    load_current_user()

def authenticate(email,password):
    # Keyed by normalized email and actual peer IP, never by a client-controlled cookie.
    bucket=hashlib.sha256((email+'\0'+(request.remote_addr or '')).encode()).hexdigest()
    user=None;status=401;error='Email or password is incorrect.'
    with transaction() as db:
        stamp=now()
        row=db.execute('SELECT * FROM auth_attempts WHERE bucket=?',(bucket,)).fetchone()
        if row and row['blocked_until']>stamp:
            return None,429,'Too many sign-in attempts. Try again in 15 minutes.'
        user=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
        valid=check_password_hash(user['password_hash'] if user else _DUMMY_HASH,password)
        if user and valid and not user['is_active']:
            return None,403,'This account is unavailable. Contact an organizer.'
        if user and valid:
            db.execute('DELETE FROM auth_attempts WHERE bucket=?',(bucket,))
            return user,200,None
        attempts=row['attempts']+1 if row and row['window_start']>stamp-900 else 1
        start=row['window_start'] if row and row['window_start']>stamp-900 else stamp
        db.execute('INSERT INTO auth_attempts(bucket,attempts,window_start,blocked_until) VALUES (?,?,?,?) '
                   'ON CONFLICT(bucket) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start,blocked_until=excluded.blocked_until',
                   (bucket,attempts,start,stamp+900 if attempts>=5 else 0))
        # Keep old buckets from growing indefinitely without weakening current cooldowns.
        db.execute('DELETE FROM auth_attempts WHERE window_start<? AND blocked_until<?',(stamp-86400,stamp))
    return None,status,error

def install_accounts(app):
    app.before_request(load_current_user)

    @app.context_processor
    def account_context():
        user=g.get('current_user')
        return {'current_user': {'id':user['id'],'name':user['name'],'email':user['email'],'role':user['role']} if user else None}

    @app.route('/register',methods=['GET','POST'])
    def register():
        if g.current_user:
            return redirect(url_for('account_page'))
        error=None;status=200;destination=safe_next(request.values.get('next',''))
        if request.method=='POST':
            try:
                data=request.form
                require(data.get('password')==data.get('password_confirm'),'The passwords do not match.')
                with transaction() as db:
                    require(not db.execute('SELECT id FROM users WHERE email=?',(normalize_email(data.get('email','')),)).fetchone(),
                            'An account with this email already exists. Please sign in.')
                    user=insert_user(db,data.get('name',''),data.get('email',''),data.get('password',''))
                    try:
                        house=validate_house(session['house']) if session.get('house') else None
                    except ValueError:
                        house=None
                    ids=list(dict.fromkeys(v for v in session.get('itinerary',[]) if isinstance(v,int)))[:20]
                    available={r['id'] for r in db.execute("SELECT id FROM events WHERE status='upcoming' AND start_at>?",(now(),))}
                    ids=[v for v in ids if v in available]
                    db.execute('UPDATE account_profiles SET house_json=?,itinerary_json=? WHERE user_id=?',
                               (json.dumps(house) if house else None,json.dumps(ids),user['id']))
                establish_login(user)
                return redirect(destination)
            except BookingError as problem:
                error=str(problem);status=400
            except sqlite3.IntegrityError:
                error='An account with this email already exists. Please sign in.';status=400
        return render_template('auth.html',registering=True,error=error,next_path=destination),status

    @app.route('/login',methods=['GET','POST'])
    def login():
        destination=safe_next(request.values.get('next',''),'/account')
        if g.current_user:
            return redirect(destination)
        error=None;status=200
        if request.method=='POST':
            email=request.form.get('email','').strip().lower()[:254]
            password=request.form.get('password','')
            # Bounded input still follows the generic failure and throttling path.
            user,status,error=authenticate(email,password if len(password)<=128 else '')
            if user:
                establish_login(user)
                if not request.form.get('next') and user['role'] in ('admin','owner'):
                    destination=url_for('admin_page')
                return redirect(destination)
        return render_template('auth.html',registering=False,error=error,next_path=destination),status

    @app.post('/logout')
    def logout():
        fresh_session()
        return redirect(url_for('home'))

    @app.get('/account')
    @login_required
    def account_page():
        with transaction() as db:
            ids=db.execute('SELECT id FROM bookings WHERE user_id=? ORDER BY created_at DESC',(g.current_user['id'],)).fetchall()
            bookings=[booking_data(db,r['id']) for r in ids]
        return render_template('account.html',bookings=bookings)

    @app.cli.command('create-admin')
    @click.option('--email',prompt=True)
    @click.option('--name',default='Organizer',show_default=True)
    @click.option('--password',prompt=True,hide_input=True,confirmation_prompt=True)
    def create_admin(email,name,password):
        import sqlite3
        try:
            with transaction() as db:
                user=insert_user(db,name,email,password,'admin')
                from activity import record_activity
                record_activity(db,'account.create','user',user['id'],None,user,'Local admin provisioning')
        except (BookingError,sqlite3.IntegrityError) as problem:
            raise click.ClickException('Unable to create admin: '+str(problem)) from problem
        click.echo('Admin account created. Sign in with your email and password.')

    @app.cli.command('reset-password')
    @click.option('--email',prompt=True)
    @click.option('--password',prompt=True,hide_input=True,confirmation_prompt=True)
    def reset_password(email,password):
        try:
            email=normalize_email(email);validate_password(password)
            with transaction() as db:
                user=db.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()
                require(user is not None,'Account not found.',404)
                db.execute('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?',
                           (generate_password_hash(password),user['id']))
                from activity import record_activity
                record_activity(db,'account.password_reset','user',user['id'],reason='Local password reset')
        except BookingError as problem:
            raise click.ClickException(str(problem)) from problem
        click.echo('Password reset. Existing account sessions have been invalidated.')
