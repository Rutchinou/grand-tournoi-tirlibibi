import os
import sqlite3
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(__file__)
DB = os.path.join(BASE, "tirlibibi.db")
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-me-in-production")

PLAYERS = ["Marie", "Paul", "Julie", "Thomas", "Sophie"]
AVATARS = ["🧙","🏴‍☠️","🦊","🤖","👑","🏴‍☠️","🐼","🦄","🐉","🧝","🧛","👽"]

def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🎲',
      role TEXT NOT NULL DEFAULT 'player'
    );
    CREATE TABLE IF NOT EXISTS games(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      image_url TEXT,
      proposed_by INTEGER NOT NULL,
      veto_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(proposed_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS votes(
      voter_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      PRIMARY KEY(voter_id, game_id),
      FOREIGN KEY(voter_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
    CREATE TABLE IF NOT EXISTS vetos(
      voter_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      PRIMARY KEY(voter_id),
      FOREIGN KEY(voter_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
    CREATE TABLE IF NOT EXISTS final_games(
      game_id INTEGER PRIMARY KEY,
      position INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'automatic',
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
    CREATE TABLE IF NOT EXISTS results(
      game_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      updated_by INTEGER,
      PRIMARY KEY(game_id, player_id),
      FOREIGN KEY(game_id) REFERENCES games(id),
      FOREIGN KEY(player_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    """)
    # Demo users, only on an empty database.
    if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        demo = [
            ("Marie","marie@example.com","Marie","🧙"),
            ("Paul","paul@example.com","Paul","🏴‍☠️"),
            ("Julie","julie@example.com","Julie","🦊"),
            ("Thomas","thomas@example.com","Thomas","🤖"),
            ("Sophie","sophie@example.com","Sophie","👑"),
            ("Admin","admin@tirlibibi.local","Admin","👑")
        ]
        for name,email,pwd,av in demo:
            role = "admin" if name == "Admin" else "player"
            c.execute("INSERT INTO users(name,email,password_hash,avatar,role) VALUES(?,?,?,?,?)",
                      (name,email,generate_password_hash(pwd),av,role))
    c.commit(); c.close()

def current_user():
    if not session.get("uid"): return None
    c=db(); u=c.execute("SELECT * FROM users WHERE id=?",(session["uid"],)).fetchone(); c.close()
    return u

def login_required(f):
    @wraps(f)
    def w(*a,**kw):
        if not current_user(): return redirect(url_for("login"))
        return f(*a,**kw)
    return w

def admin_required(f):
    @wraps(f)
    def w(*a,**kw):
        u=current_user()
        if not u or u["role"]!="admin":
            flash("Accès réservé à l'administrateur.","error")
            return redirect(url_for("home"))
        return f(*a,**kw)
    return w

def proposed_games(c):
    return c.execute("""SELECT g.*, u.name proposer, u.avatar
                        FROM games g JOIN users u ON u.id=g.proposed_by
                        ORDER BY u.id, g.id""").fetchall()

def automatic_selection(c):
    # Each proposer contributes exactly three non-vetoed games.
    # Within each list, score = sum(6-rank) for votes from other players.
    users = c.execute("SELECT * FROM users WHERE role='player' ORDER BY id").fetchall()
    selected=[]
    for u in users:
        rows=c.execute("""
          SELECT g.*, COALESCE(SUM(6-v.rank),0) score
          FROM games g LEFT JOIN votes v ON v.game_id=g.id
          WHERE g.proposed_by=? AND g.veto_count=0
          GROUP BY g.id ORDER BY score DESC, g.id
          LIMIT 3
        """,(u["id"],)).fetchall()
        selected.extend(rows)
    # A valid state has exactly 15 rows. If not, return what is available;
    # the admin UI flags the missing representation.
    return selected

@app.route("/")
def home():
    c=db()
    users=c.execute("SELECT * FROM users WHERE role='player' ORDER BY id").fetchall()
    games=proposed_games(c)
    finals=c.execute("""SELECT f.position,g.name,g.image_url,u.name proposer
                       FROM final_games f JOIN games g ON g.id=f.game_id
                       JOIN users u ON u.id=g.proposed_by ORDER BY f.position""").fetchall()
    c.close()
    return render_template("home.html", user=current_user(), users=users, games=games, finals=finals)

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method=="POST":
        email=request.form["email"].strip().lower()
        pwd=request.form["password"]
        c=db(); u=c.execute("SELECT * FROM users WHERE lower(email)=?",(email,)).fetchone(); c.close()
        if u and check_password_hash(u["password_hash"],pwd):
            session["uid"]=u["id"]; return redirect(url_for("home"))
        flash("Adresse mail ou mot de passe incorrect.","error")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear(); return redirect(url_for("home"))

@app.route("/register", methods=["GET","POST"])
def register():
    if request.method=="POST":
        name=request.form["name"].strip(); email=request.form["email"].strip().lower()
        pwd=request.form["password"]; avatar=request.form.get("avatar","🎲")
        c=db()
        try:
            c.execute("INSERT INTO users(name,email,password_hash,avatar) VALUES(?,?,?,?)",
                      (name,email,generate_password_hash(pwd),avatar)); c.commit()
        except sqlite3.IntegrityError:
            c.close(); flash("Ce nom ou cette adresse mail existe déjà.","error")
            return render_template("register.html", avatars=AVATARS)
        uid=c.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone()[0]; c.close()
        session["uid"]=uid; return redirect(url_for("home"))
    return render_template("register.html", avatars=AVATARS)

@app.route("/preparation", methods=["GET","POST"])
@login_required
def preparation():
    u=current_user(); c=db()
    if request.method=="POST":
        name=request.form["game"].strip()
        if not name: flash("Saisissez un jeu.","error")
        elif c.execute("SELECT id FROM games WHERE lower(name)=lower(?)",(name,)).fetchone():
            g=c.execute("SELECT g.name,u.name proposer FROM games g JOIN users u ON u.id=g.proposed_by WHERE lower(g.name)=lower(?)",(name,)).fetchone()
            flash(f"Jeu déjà proposé par {g['proposer']} : {g['name']}. Choisissez un autre jeu.","error")
        elif c.execute("SELECT COUNT(*) FROM games WHERE proposed_by=?",(u["id"],)).fetchone()[0] >= 5:
            flash("Vous avez déjà vos 5 jeux.","error")
        else:
            c.execute("INSERT INTO games(name,proposed_by) VALUES(?,?)",(name,u["id"])); c.commit()
            flash("Jeu ajouté.","success")
    mine=c.execute("SELECT * FROM games WHERE proposed_by=? ORDER BY id",(u["id"],)).fetchall()
    others=c.execute("""SELECT g.*,u.name proposer,u.avatar FROM games g JOIN users u ON u.id=g.proposed_by
                        WHERE g.proposed_by<>? ORDER BY u.id,g.id""",(u["id"],)).fetchall()
    veto=c.execute("SELECT v.game_id,g.name FROM vetos v JOIN games g ON g.id=v.game_id WHERE v.voter_id=?",(u["id"],)).fetchone()
    c.close()
    return render_template("preparation.html",user=u,mine=mine,others=others,veto=veto)

@app.post("/vote")
@login_required
def vote():
    u=current_user(); c=db()
    # One complete ranking per other player.
    for proposer in PLAYERS:
        p=c.execute("SELECT id FROM users WHERE name=? AND role='player'",(proposer,)).fetchone()
        if not p or p["id"]==u["id"]: continue
        games=c.execute("SELECT id FROM games WHERE proposed_by=? ORDER BY id",(p["id"],)).fetchall()
        vals=[]
        for g in games:
            key=f"rank_{g['id']}"
            try: r=int(request.form[key])
            except: r=0
            vals.append((g["id"],r))
        ranks=[r for _,r in vals]
        if len(vals)!=5 or sorted(ranks)!=[1,2,3,4,5]:
            c.close(); flash(f"Le classement de la liste de {proposer} doit contenir exactement 1, 2, 3, 4 et 5.","error")
            return redirect(url_for("preparation"))
        for gid,r in vals:
            c.execute("INSERT OR REPLACE INTO votes(voter_id,game_id,rank) VALUES(?,?,?)",(u["id"],gid,r))
    c.commit(); c.close(); flash("Votes enregistrés.","success"); return redirect(url_for("preparation"))

@app.post("/veto/<int:game_id>")
@login_required
def veto(game_id):
    u=current_user(); c=db()
    if c.execute("SELECT 1 FROM vetos WHERE voter_id=?",(u["id"],)).fetchone():
        c.close(); flash("Vous avez déjà utilisé votre veto.","error"); return redirect(url_for("preparation"))
    g=c.execute("SELECT * FROM games WHERE id=?",(game_id,)).fetchone()
    if not g or g["proposed_by"]==u["id"]:
        c.close(); flash("Veto impossible sur ce jeu.","error"); return redirect(url_for("preparation"))
    count=c.execute("SELECT COUNT(*) FROM vetos v JOIN games g ON g.id=v.game_id WHERE g.proposed_by=?",(g["proposed_by"],)).fetchone()[0]
    if count>=2:
        c.close(); flash("Cette liste a déjà reçu 2 vetos : ses 3 jeux restants doivent être préservés.","error"); return redirect(url_for("preparation"))
    c.execute("INSERT INTO vetos(voter_id,game_id) VALUES(?,?)",(u["id"],game_id))
    c.execute("UPDATE games SET veto_count=veto_count+1 WHERE id=?",(game_id,))
    c.commit(); c.close(); flash("Veto enregistré.","success"); return redirect(url_for("preparation"))

@app.route("/admin")
@admin_required
def admin():
    c=db(); games=proposed_games(c)
    finals=c.execute("""SELECT f.position,g.id,g.name,g.proposed_by,u.name proposer
                       FROM final_games f JOIN games g ON g.id=f.game_id
                       JOIN users u ON u.id=g.proposed_by ORDER BY f.position""").fetchall()
    suggested=automatic_selection(c)
    users=c.execute("SELECT * FROM users WHERE role='player' ORDER BY id").fetchall()
    c.close()
    return render_template("admin.html",user=current_user(),games=games,finals=finals,suggested=suggested,users=users)

@app.post("/admin/auto-select")
@admin_required
def admin_auto_select():
    c=db(); c.execute("DELETE FROM final_games")
    rows=automatic_selection(c)
    for pos,g in enumerate(rows,1):
        c.execute("INSERT INTO final_games(game_id,position,source) VALUES(?,?,?)",(g["id"],pos,"automatic"))
    c.commit(); c.close(); flash(f"Sélection automatique générée : {len(rows)} jeux.","success"); return redirect(url_for("admin"))

@app.post("/admin/finals")
@admin_required
def admin_finals():
    ids=[int(x) for x in request.form.getlist("game_id") if x.isdigit()]
    ids=list(dict.fromkeys(ids))[:15]
    c=db(); c.execute("DELETE FROM final_games")
    for pos,gid in enumerate(ids,1):
        c.execute("INSERT INTO final_games(game_id,position,source) VALUES(?,?,?)",(gid,pos,"admin"))
    c.commit(); c.close(); flash(f"Sélection administrateur enregistrée : {len(ids)} jeux.","success"); return redirect(url_for("admin"))

@app.route("/tournoi")
@login_required
def tournoi():
    c=db()
    games=c.execute("""SELECT f.position,g.*,u.name proposer FROM final_games f
                      JOIN games g ON g.id=f.game_id JOIN users u ON u.id=g.proposed_by
                      ORDER BY f.position""").fetchall()
    users=c.execute("SELECT * FROM users WHERE role='player' ORDER BY id").fetchall()
    resultrows=c.execute("SELECT * FROM results").fetchall()
    results={(r["game_id"],r["player_id"]):r["rank"] for r in resultrows}
    c.close()
    points={u["id"]:0 for u in users}
    for (gid,pid),rank in results.items(): points[pid]+=6-rank
    return render_template("tournoi.html",user=current_user(),games=games,users=users,results=results,points=points)

@app.post("/result/<int:game_id>")
@login_required
def result(game_id):
    u=current_user(); c=db()
    if u["role"]!="admin" and c.execute("SELECT 1 FROM final_games WHERE game_id=?",(game_id,)).fetchone() is None:
        c.close(); return redirect(url_for("tournoi"))
    vals=[]
    users=c.execute("SELECT id FROM users WHERE role='player' ORDER BY id").fetchall()
    for x in users:
        try: vals.append((x["id"],int(request.form[f"rank_{x['id']}"])))
        except: pass
    if sorted([r for _,r in vals]) != [1,2,3,4,5]:
        c.close(); flash("Un résultat doit contenir exactement les places 1, 2, 3, 4 et 5.","error"); return redirect(url_for("tournoi"))
    c.execute("DELETE FROM results WHERE game_id=?",(game_id,))
    for pid,r in vals: c.execute("INSERT INTO results(game_id,player_id,rank,updated_by) VALUES(?,?,?,?)",(game_id,pid,r,u["id"]))
    c.commit(); c.close(); flash("Résultat enregistré.","success"); return redirect(url_for("tournoi"))

@app.route("/stats")
@login_required
def stats():
    c=db(); users=c.execute("SELECT * FROM users WHERE role='player' ORDER BY id").fetchall()
    chosen=request.args.get("player", users[0]["id"] if users else "")
    rows=c.execute("""SELECT r.*,g.name FROM results r JOIN games g ON g.id=r.game_id
                      WHERE r.player_id=? ORDER BY g.id""",(chosen,)).fetchall()
    c.close()
    ranks=[r["rank"] for r in rows]
    total=sum(6-r for r in ranks)
    return render_template("stats.html",user=current_user(),users=users,chosen=int(chosen),rows=rows,ranks=ranks,total=total)

@app.get("/api/game-search")
@login_required
def game_search():
    # Pluggable adapter: production deployment can set BOARDGAME_API_URL.
    # Returning a normalized shape keeps the front-end independent of the provider.
    q=request.args.get("q","").strip()
    if not q: return jsonify([])
    # Demo fallback. Replace with a real board-game provider in deployment.
    known=["Azul","7 Wonders","Codenames","Splendor","Dixit","Carcassonne","Kingdomino","Skyjo","Just One","Wingspan","Cascadia","Patchwork","Dragomino","Sushi Go!"]
    out=[{"name":g,"image_url":None} for g in known if q.lower() in g.lower()]
    return jsonify(out[:8])

init_db()
if __name__=="__main__":
    app.run(debug=True)
