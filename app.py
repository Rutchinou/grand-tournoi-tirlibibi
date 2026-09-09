import os
import re
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg
from psycopg.rows import dict_row

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-only-change-me')

AVATARS = ['🧙','🏴‍☠️','🦊','🤖','👑','🐼','🦄','🐉','🧝','🧛','👽','🐸']
POINTS = {1:5, 2:4, 3:3, 4:2, 5:1}


def conn():
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise RuntimeError('DATABASE_URL est manquante.')
    return psycopg.connect(url, row_factory=dict_row)


def init_db():
    with conn() as c:
        c.execute("ALTER TABLE public.players ADD COLUMN IF NOT EXISTS password_hash text")
        c.execute("ALTER TABLE public.players ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player'")
        c.execute("ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS players_email_lower_idx ON public.players (lower(email))")
        # Keep the tournament to five players, but allow one admin account.
        admin_email = os.environ.get('ADMIN_EMAIL', '').strip().lower()
        admin_password = os.environ.get('ADMIN_PASSWORD', '')
        admin_name = os.environ.get('ADMIN_NAME', 'Admin').strip() or 'Admin'
        if admin_email and admin_password:
            row = c.execute('SELECT id FROM public.players WHERE lower(email)=%s', (admin_email,)).fetchone()
            if row:
                c.execute('UPDATE public.players SET role=\'admin\', is_admin=true, password_hash=%s, name=%s WHERE id=%s',
                          (generate_password_hash(admin_password), admin_name, row['id']))
            else:
                c.execute('INSERT INTO public.players(email,name,password_hash,avatar,role,is_admin) VALUES(%s,%s,%s,%s,\'admin\',true)',
                          (admin_email, admin_name, generate_password_hash(admin_password), '👑'))


def current_user():
    uid = session.get('uid')
    if not uid:
        return None
    with conn() as c:
        return c.execute('SELECT * FROM public.players WHERE id=%s', (uid,)).fetchone()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user():
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u or not u['is_admin']:
            flash('Accès réservé à l’administrateur.', 'error')
            return redirect(url_for('home'))
        return f(*args, **kwargs)
    return wrapper


def normalize_name(name):
    s = name.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def players(c):
    return c.execute("SELECT * FROM public.players WHERE role='player' ORDER BY created_at, id").fetchall()


def automatic_selection(c):
    selected = []
    for p in players(c):
        rows = c.execute('''
            SELECT g.*, COALESCE(SUM(6-v.priority),0) AS score
            FROM public.games g
            LEFT JOIN public.game_votes v ON v.game_id=g.id
            WHERE g.proposed_by=%s
              AND NOT EXISTS (SELECT 1 FROM public.vetos x WHERE x.game_id=g.id)
            GROUP BY g.id
            ORDER BY score DESC, g.created_at
            LIMIT 3
        ''', (p['id'],)).fetchall()
        selected.extend(rows)
    return selected


@app.context_processor
def inject_globals():
    return {'current_user': current_user(), 'avatars': AVATARS}


@app.get('/')
def home():
    with conn() as c:
        ps = players(c)
        finals = c.execute('''SELECT f.position,g.*,p.name proposer,p.avatar proposer_avatar
                             FROM public.final_games f JOIN public.games g ON g.id=f.game_id
                             JOIN public.players p ON p.id=g.proposed_by ORDER BY f.position''').fetchall()
    return render_template('home.html', players=ps, finals=finals)


@app.route('/login', methods=['GET','POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email','').strip().lower()
        password = request.form.get('password','')
        with conn() as c:
            u = c.execute('SELECT * FROM public.players WHERE lower(email)=%s', (email,)).fetchone()
        if u and u['password_hash'] and check_password_hash(u['password_hash'], password):
            session['uid'] = str(u['id'])
            return redirect(url_for('home'))
        flash('Adresse mail ou mot de passe incorrect.', 'error')
    return render_template('login.html')


@app.get('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))


@app.route('/register', methods=['GET','POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name','').strip()
        email = request.form.get('email','').strip().lower()
        password = request.form.get('password','')
        avatar = request.form.get('avatar','🎲')
        if not name or not email or not password:
            flash('Tous les champs sont obligatoires.', 'error')
            return render_template('register.html')
        with conn() as c:
            count = c.execute("SELECT COUNT(*) AS n FROM public.players WHERE role='player'").fetchone()['n']
            exists = c.execute('SELECT id FROM public.players WHERE lower(email)=%s OR lower(name)=%s', (email,name.lower())).fetchone()
            if count >= 5:
                flash('Les 5 places de joueurs sont déjà prises.', 'error')
            elif exists:
                flash('Ce nom ou cette adresse mail est déjà utilisé.', 'error')
            else:
                row = c.execute('''INSERT INTO public.players(email,name,password_hash,avatar,role,is_admin)
                                   VALUES(%s,%s,%s,%s,'player',false) RETURNING id''',
                                (email,name,generate_password_hash(password),avatar)).fetchone()
                session['uid'] = str(row['id'])
                flash('Bienvenue dans le Tournoi des Tirlibibi !', 'success')
                return redirect(url_for('home'))
    return render_template('register.html')


@app.route('/preparation', methods=['GET','POST'])
@login_required
def preparation():
    u = current_user()
    with conn() as c:
        locked = c.execute("SELECT preparation_locked FROM public.tournament_settings WHERE id=1").fetchone()['preparation_locked']
        if request.method == 'POST' and not locked:
            name = request.form.get('game','').strip()
            if not name:
                flash('Saisissez un jeu.', 'error')
            elif c.execute('SELECT id FROM public.games WHERE normalized_name=%s', (normalize_name(name),)).fetchone():
                g = c.execute('''SELECT g.name,p.name proposer FROM public.games g JOIN public.players p ON p.id=g.proposed_by
                                 WHERE g.normalized_name=%s''', (normalize_name(name),)).fetchone()
                flash(f"Jeu déjà proposé par {g['proposer']} : {g['name']}. Choisissez un autre jeu.", 'error')
            elif c.execute('SELECT COUNT(*) AS n FROM public.games WHERE proposed_by=%s', (u['id'],)).fetchone()['n'] >= 5:
                flash('Vous avez déjà vos 5 jeux.', 'error')
            else:
                c.execute('''INSERT INTO public.games(name,normalized_name,proposed_by) VALUES(%s,%s,%s)''',
                          (name,normalize_name(name),u['id']))
                flash('Jeu ajouté.', 'success')
        mine = c.execute('SELECT * FROM public.games WHERE proposed_by=%s ORDER BY created_at', (u['id'],)).fetchall()
        others = c.execute('''SELECT g.*,p.name proposer,p.avatar FROM public.games g JOIN public.players p ON p.id=g.proposed_by
                              WHERE g.proposed_by<>%s ORDER BY p.created_at,g.created_at''', (u['id'],)).fetchall()
        veto = c.execute('SELECT v.game_id FROM public.vetos v WHERE v.player_id=%s', (u['id'],)).fetchone()
        vetoed_by_list = c.execute('''SELECT g.proposed_by,COUNT(*) n FROM public.vetos v JOIN public.games g ON g.id=v.game_id GROUP BY g.proposed_by''').fetchall()
        votes = c.execute('SELECT game_id,priority FROM public.game_votes WHERE voter_id=%s', (u['id'],)).fetchall()
        vote_map = {str(x['game_id']):x['priority'] for x in votes}
    return render_template('preparation.html', mine=mine, others=others, veto=veto, vetoed_by_list=vetoed_by_list, vote_map=vote_map, locked=locked)


@app.post('/vote')
@login_required
def vote():
    u = current_user()
    with conn() as c:
        locked = c.execute("SELECT preparation_locked FROM public.tournament_settings WHERE id=1").fetchone()['preparation_locked']
        if locked:
            flash('La préparation est verrouillée.', 'error')
            return redirect(url_for('preparation'))
        ps = [p for p in players(c) if p['id'] != u['id']]
        for p in ps:
            gs = c.execute('SELECT id FROM public.games WHERE proposed_by=%s ORDER BY created_at', (p['id'],)).fetchall()
            vals=[]
            for g in gs:
                try: r=int(request.form.get(f"rank_{g['id']}", '0'))
                except ValueError: r=0
                vals.append((g['id'],r))
            ranks=[r for _,r in vals]
            if len(gs)!=5 or sorted(ranks)!=[1,2,3,4,5]:
                flash(f"Le classement de la liste de {p['name']} doit contenir exactement 1, 2, 3, 4 et 5.", 'error')
                return redirect(url_for('preparation'))
            for gid,r in vals:
                c.execute('''INSERT INTO public.game_votes(voter_id,game_id,priority) VALUES(%s,%s,%s)
                             ON CONFLICT(voter_id,game_id) DO UPDATE SET priority=EXCLUDED.priority''', (u['id'],gid,r))
        flash('Votes enregistrés.', 'success')
    return redirect(url_for('preparation'))


@app.post('/veto/<uuid:game_id>')
@login_required
def veto(game_id):
    u=current_user()
    with conn() as c:
        locked=c.execute("SELECT preparation_locked FROM public.tournament_settings WHERE id=1").fetchone()['preparation_locked']
        if locked:
            flash('La préparation est verrouillée.', 'error'); return redirect(url_for('preparation'))
        if c.execute('SELECT 1 FROM public.vetos WHERE player_id=%s',(u['id'],)).fetchone():
            flash('Vous avez déjà utilisé votre veto.', 'error'); return redirect(url_for('preparation'))
        g=c.execute('SELECT * FROM public.games WHERE id=%s',(game_id,)).fetchone()
        if not g or g['proposed_by']==u['id']:
            flash('Veto impossible sur ce jeu.', 'error'); return redirect(url_for('preparation'))
        n=c.execute('''SELECT COUNT(*) n FROM public.vetos v JOIN public.games g ON g.id=v.game_id WHERE g.proposed_by=%s''',(g['proposed_by'],)).fetchone()['n']
        if n>=2:
            flash('Cette liste a déjà reçu 2 vetos.', 'error'); return redirect(url_for('preparation'))
        c.execute('INSERT INTO public.vetos(player_id,game_id) VALUES(%s,%s)',(u['id'],game_id))
        flash('Veto enregistré.', 'success')
    return redirect(url_for('preparation'))


@app.route('/admin', methods=['GET'])
@admin_required
def admin():
    with conn() as c:
        gs=c.execute('''SELECT g.*,p.name proposer,p.avatar FROM public.games g JOIN public.players p ON p.id=g.proposed_by
                        ORDER BY p.created_at,g.created_at''').fetchall()
        finals=c.execute('''SELECT f.position,g.*,p.name proposer FROM public.final_games f JOIN public.games g ON g.id=f.game_id
                            JOIN public.players p ON p.id=g.proposed_by ORDER BY f.position''').fetchall()
        suggested=automatic_selection(c)
        ps=players(c)
    return render_template('admin.html', games=gs, finals=finals, suggested=suggested, players=ps)


@app.post('/admin/auto-select')
@admin_required
def admin_auto_select():
    with conn() as c:
        ps=players(c)
        if len(ps)!=5 or any(c.execute('SELECT COUNT(*) n FROM public.games WHERE proposed_by=%s',(p['id'],)).fetchone()['n']!=5 for p in ps):
            flash('Il faut 5 joueurs avec 5 jeux chacun avant la sélection.', 'error'); return redirect(url_for('admin'))
        rows=automatic_selection(c)
        if len(rows)!=15:
            flash('La sélection automatique ne peut pas produire 15 jeux (vérifiez les vetos).', 'error'); return redirect(url_for('admin'))
        c.execute('DELETE FROM public.final_games')
        for pos,g in enumerate(rows,1):
            c.execute('INSERT INTO public.final_games(game_id,position,selected_automatically,admin_modified) VALUES(%s,%s,true,false)',(g['id'],pos))
        flash('Les 15 jeux ont été sélectionnés automatiquement : 3 par joueur.', 'success')
    return redirect(url_for('admin'))


@app.post('/admin/finals')
@admin_required
def admin_finals():
    ids=[]
    for x in request.form.getlist('game_id'):
        try: ids.append(x)
        except: pass
    ids=list(dict.fromkeys(ids))
    with conn() as c:
        if len(ids)!=15:
            flash('La sélection finale doit contenir exactement 15 jeux.', 'error'); return redirect(url_for('admin'))
        counts={}
        for gid in ids:
            row=c.execute('SELECT proposed_by FROM public.games WHERE id=%s',(gid,)).fetchone()
            if not row: flash('Jeu invalide.', 'error'); return redirect(url_for('admin'))
            counts[str(row['proposed_by'])]=counts.get(str(row['proposed_by']),0)+1
        if sorted(counts.values()) != [3,3,3,3,3]:
            flash('La sélection finale doit contenir exactement 3 jeux issus de chaque joueur.', 'error'); return redirect(url_for('admin'))
        c.execute('DELETE FROM public.final_games')
        for pos,gid in enumerate(ids,1):
            c.execute('INSERT INTO public.final_games(game_id,position,selected_automatically,admin_modified) VALUES(%s,%s,false,true)',(gid,pos))
        flash('Sélection administrateur enregistrée.', 'success')
    return redirect(url_for('admin'))


@app.post('/admin/lock')
@admin_required
def admin_lock():
    with conn() as c:
        c.execute('UPDATE public.tournament_settings SET preparation_locked=true, updated_at=now() WHERE id=1')
    flash('Préparation verrouillée.', 'success')
    return redirect(url_for('admin'))


@app.get('/tournoi')
@login_required
def tournoi():
    with conn() as c:
        gs=c.execute('''SELECT f.position,g.*,p.name proposer FROM public.final_games f JOIN public.games g ON g.id=f.game_id
                        JOIN public.players p ON p.id=g.proposed_by ORDER BY f.position''').fetchall()
        ps=players(c)
        rs=c.execute('SELECT game_id,player_id,rank FROM public.results').fetchall()
    results={(str(r['game_id']),str(r['player_id'])):r['rank'] for r in rs}
    totals={str(p['id']):0 for p in ps}
    for r in rs: totals[str(r['player_id'])]+=POINTS[r['rank']]
    standings=sorted(ps,key=lambda p:(-totals[str(p['id'])],str(p['name']).lower()))
    return render_template('tournoi.html', games=gs, players=ps, results=results, totals=totals, standings=standings)


@app.route('/result/<uuid:game_id>', methods=['GET','POST'])
@login_required
def result(game_id):
    u=current_user()
    with conn() as c:
        if not c.execute('SELECT 1 FROM public.final_games WHERE game_id=%s',(game_id,)).fetchone():
            return redirect(url_for('tournoi'))
        ps=players(c)
        if request.method=='POST':
            vals=[]
            for p in ps:
                try: r=int(request.form.get(f"rank_{p['id']}", '0'))
                except ValueError: r=0
                vals.append((p['id'],r))
            if sorted([r for _,r in vals]) != [1,2,3,4,5]:
                flash('Un résultat doit contenir exactement les places 1, 2, 3, 4 et 5.', 'error')
                return redirect(url_for('result',game_id=game_id))
            c.execute('DELETE FROM public.results WHERE game_id=%s',(game_id,))
            for pid,r in vals:
                c.execute('INSERT INTO public.results(game_id,player_id,rank,points,entered_by,is_admin_edit) VALUES(%s,%s,%s,%s,%s,%s)',
                          (game_id,pid,r,POINTS[r],u['id'],bool(u['is_admin'])))
            flash('Résultat enregistré.', 'success')
            return redirect(url_for('tournoi'))
        g=c.execute('''SELECT g.*,p.name proposer FROM public.games g JOIN public.players p ON p.id=g.proposed_by WHERE g.id=%s''',(game_id,)).fetchone()
        old=c.execute('SELECT player_id,rank FROM public.results WHERE game_id=%s',(game_id,)).fetchall()
        oldmap={str(r['player_id']):r['rank'] for r in old}
    return render_template('result.html', game=g, players=ps, oldmap=oldmap)


@app.get('/stats')
@login_required
def stats():
    with conn() as c:
        ps=players(c)
        chosen=request.args.get('player') or (str(ps[0]['id']) if ps else '')
        rows=c.execute('''SELECT r.rank,r.points,g.name FROM public.results r JOIN public.games g ON g.id=r.game_id
                          WHERE r.player_id=%s ORDER BY g.created_at''',(chosen,)).fetchall()
        player=c.execute('SELECT * FROM public.players WHERE id=%s',(chosen,)).fetchone()
    ranks=[r['rank'] for r in rows]
    total=sum(r['points'] for r in rows)
    podiums=sum(1 for r in ranks if r<=3)
    return render_template('stats.html', players=ps, player=player, rows=rows, ranks=ranks, total=total, podiums=podiums)


@app.get('/api/game-search')
@login_required
def game_search():
    # Provider integration will be added in the next step. The database already
    # has image_url/external_id/external_source/game_url fields for it.
    q=request.args.get('q','').strip().lower()
    known=['Azul','7 Wonders','Codenames','Splendor','Dixit','Carcassonne','Kingdomino','Skyjo','Just One','Wingspan','Cascadia','Patchwork','Dragomino','Sushi Go!']
    return jsonify([{'name':x,'image_url':None} for x in known if q in x.lower()][:8])


if __name__ == '__main__':
    if os.environ.get('DATABASE_URL'):
        init_db()
    app.run(host='0.0.0.0',port=int(os.environ.get('PORT',5000)),debug=False)
else:
    if os.environ.get('DATABASE_URL'):
        init_db()
