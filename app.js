const cfg = window.TIRLIBIBI_CONFIG || {};
const { createClient } = window.supabase;
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const AVATARS = ['🎲','🧙','🏴‍☠️','🦊','🤖','👑','🐼','🦄','🐉','🧝','🧛','👽','🐸'];
const POINTS = {1:5,2:4,3:3,4:2,5:1};
let state = { user:null, me:null, players:[], games:[], finals:[], votes:[], veto:null, vetos:[], results:[], settings:null };

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
function flash(msg,type='error'){ return `<div class="flash ${type}">${esc(msg)}</div>`; }
function auth(){ return !!state.user; }
function route(){ return location.hash.replace(/^#/,'') || '/'; }

async function load(){
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('COLLER_ICI')) {
    $('#app').innerHTML = `<div class="card narrow"><h2>⚙️ Configuration à terminer</h2><p>Ouvrez <b>config.js</b> et collez l'URL de votre projet Supabase et sa clé Publishable/anon.</p></div>`;
    return;
  }
  const {data:{session}} = await sb.auth.getSession();
  state.user = session?.user || null;
  if(state.user) await loadData();
  renderNav(); render();
}
async function loadData(){
  const uid = state.user.id;
  let profile = await sb.from('players').select('*').eq('id',uid).maybeSingle();
  if(!profile.data && !profile.error){
    const md = state.user.user_metadata || {};
    const name = md.name || (state.user.email || '').split('@')[0];
    const avatar = md.avatar || '🎲';
    const ins = await sb.from('players').insert({id:uid,email:state.user.email,name,avatar});
    if(!ins.error) profile = await sb.from('players').select('*').eq('id',uid).maybeSingle();
  }
  const [players,games,finals,votes,veto,vetos,results,settings] = await Promise.all([
    sb.from('players').select('*').eq('is_admin',false).order('created_at'),
    sb.from('games').select('*').order('created_at'),
    sb.from('final_games').select('*,games(*)').order('position'),
    state.me?.is_admin ? sb.from('game_votes').select('*') : sb.from('game_votes').select('*').eq('voter_id',uid),
    sb.from('vetos').select('*').eq('player_id',uid).maybeSingle(),
    sb.from('vetos').select('*'),
    sb.from('results').select('*'),
    sb.from('tournament_settings').select('*').eq('id',1).single()
  ]);
  state.me=profile.data; state.players=players.data||[]; state.games=games.data||[];
  state.finals=finals.data||[]; state.votes=votes.data||[]; state.veto=veto.data;
  state.vetos=vetos.data||[]; state.results=results.data||[]; state.settings=settings.data;
}
function renderNav(){
  const n=$('#nav');
  if(!state.user){n.innerHTML=`<a href="#/login">Connexion</a><a href="#/register" class="button">Participer</a>`;return;}
  n.innerHTML=`<a href="#/">Accueil</a><a href="#/preparation">Préparation</a><a href="#/tournoi">Tournoi</a><a href="#/stats">Stats</a>${state.me?.is_admin?'<a href="#/admin">⚙️ Admin</a>':''}<a href="#" id="logout">Déconnexion</a>`;
  $('#logout')?.addEventListener('click',async e=>{e.preventDefault();await sb.auth.signOut();location.hash='/';await load();});
}
async function render(){
  const r=route();
  if(r==='/login') return renderLogin();
  if(r==='/register') return renderRegister();
  if(!state.user) return renderHome();
  if(!state.me) return renderProfile();
  if(r==='/preparation') return renderPreparation();
  if(r==='/tournoi') return renderTournament();
  if(r.startsWith('/result/')) return renderResult(r.split('/')[2]);
  if(r==='/stats') return renderStats();
  if(r==='/admin' && state.me.is_admin) return renderAdmin();
  renderHome();
}
function renderHome(){
  $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">SAISON 1 · 5 JOUEURS · 15 JEUX</div><h1>Le Grand <strong>Tournoi</strong> des Tirlibibi</h1><p>Choisissez vos jeux, votez, utilisez votre veto… puis affrontez-vous sur les 15 jeux retenus.</p><div class="actions">${state.user?'<a class="button" href="#/preparation">Entrer dans le tournoi</a>':'<a class="button" href="#/register">Créer mon joueur</a><a class="button light" href="#/login">Me connecter</a>'}</div></div><div class="dice">🎲</div></section>
  <div class="card"><h2>Les joueurs</h2><div class="players">${state.players.map(p=>`<div class="player"><span class="avatar">${p.avatar}</span><b>${esc(p.name)}</b></div>`).join('')||'<span class="muted">Les joueurs apparaîtront ici.</span>'}</div></div>
  ${state.finals.length?`<div class="card"><h2>Les 15 jeux du tournoi</h2><div class="game-grid">${state.finals.map(f=>gameCard(f.games,f.position)).join('')}</div></div>`:''}`;
}
function gameCard(g,pos=''){
  if(!g)return '';
  return `<article class="game"><div class="cover">${g.image_url?`<img src="${esc(g.image_url)}" alt="">`:'🎲'}</div><b>${pos?pos+'. ':''}${esc(g.name)}</b><small class="muted">${esc(state.players.find(p=>p.id===g.proposed_by)?.name||'')}</small></article>`;
}
function renderLogin(){
  $('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">CONNEXION</div><h1>Bienvenue</h1><form id="loginForm"><label>Email<input type="email" id="email" required></label><label>Mot de passe<input type="password" id="password" required></label><button class="button">Se connecter</button></form><p class="muted">Pas encore inscrit ? <a href="#/register">Créer mon compte</a></p></div>`;
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)return $('#app').insertAdjacentHTML('afterbegin',flash(error.message));location.hash='/';await load();};
}
function renderRegister(){
  $('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">INSCRIPTION</div><h1>Je rejoins le tournoi</h1><form id="regForm"><label>Prénom / pseudo<input id="name" maxlength="40" required></label><label>Email<input type="email" id="email" required></label><label>Mot de passe<input type="password" id="password" minlength="6" required></label><label>Mon avatar</label><div class="avatars">${AVATARS.map((a,i)=>`<label class="avatar-choice"><input type="radio" name="avatar" value="${a}" ${i===0?'checked':''}><span>${a}</span></label>`).join('')}</div><button class="button">Créer mon compte</button></form><p class="muted">Le tournoi est limité à 5 joueurs.</p></div>`;
  $('#regForm').onsubmit=async e=>{
    e.preventDefault();
    const name=$('#name').value.trim(), email=$('#email').value.trim().toLowerCase(), password=$('#password').value, avatar=document.querySelector('input[name=avatar]:checked').value;
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{name,avatar}}});
    if(error)return $('#app').insertAdjacentHTML('afterbegin',flash(error.message));
    if(!data.user)return $('#app').insertAdjacentHTML('afterbegin',flash('Inscription créée. Vérifiez votre email puis connectez-vous.'));
    if(data.session){ await load(); location.hash='/'; }
    else { $('#app').innerHTML=flash('Compte créé ! Vérifiez votre email si Supabase demande une confirmation, puis revenez ici pour vous connecter.','success') + `<div class="card narrow"><a class="button" href="#/login">Se connecter</a></div>`; }
  };
}
function renderProfile(){
  $('#app').innerHTML=`<div class="card narrow"><h2>Profil à finaliser</h2><p>Votre compte Auth existe mais votre profil joueur n'a pas pu être créé.</p><p>Déconnectez-vous puis réessayez l'inscription.</p></div>`;
}
function renderPreparation(){
  const mine=state.games.filter(g=>g.proposed_by===state.me.id);
  const others=state.players.filter(p=>p.id!==state.me.id).map(p=>({...p,games:state.games.filter(g=>g.proposed_by===p.id)}));
  const locked=state.settings?.preparation_locked;
  const voteMap=Object.fromEntries(state.votes.map(v=>[v.game_id,v.priority]));
  const vetoCounts={};state.vetos.forEach(v=>{const g=state.games.find(x=>x.id===v.game_id);if(g)vetoCounts[g.proposed_by]=(vetoCounts[g.proposed_by]||0)+1;});
  $('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 1</div><h1>Préparation</h1></div><span class="badge">${mine.length}/5 jeux proposés</span></div>
  ${locked?flash('La préparation est verrouillée. Les choix sont maintenant figés.','success'):''}
  <div class="card"><h2>1. Mes 5 jeux</h2><p class="muted">Chaque jeu doit être différent de tous les autres.</p>${!locked&&mine.length<5?`<form id="gameForm" class="inline-form"><input id="gameName" placeholder="Nom du jeu de société" required><button class="button">Ajouter le jeu</button></form>`:''}<ol>${mine.map(g=>`<li><b>${esc(g.name)}</b></li>`).join('')}</ol></div>
  <div class="card"><h2>2. Je classe les jeux des autres joueurs</h2><p>Pour chaque liste, attribuez obligatoirement <b>1, 2, 3, 4 et 5</b>, une seule fois.</p>
  ${others.map(p=>`<section><h3>${p.avatar} ${esc(p.name)}</h3>${p.games.length<5?`<p class="ko">Cette liste n'est pas encore complète.</p>`:p.games.map(g=>`<div class="vote-row"><span>${esc(g.name)}</span><select class="rankSel" data-game="${g.id}"><option value="">Priorité…</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${voteMap[g.id]===n?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}${p.games.length===5&&!locked?`<button class="button light saveVotes" data-player="${p.id}">Enregistrer ce classement</button>`:''}</section>`).join('')}</div>
  <div class="card"><h2>3. Mon veto</h2><p>Un seul veto pour tout le tournoi. Une liste ne peut recevoir que 2 vetos maximum.</p>${state.veto?`<div class="notice">Veto utilisé sur : <b>${esc(state.games.find(g=>g.id===state.veto.game_id)?.name||'')}</b></div>`:locked?'<p class="muted">Veto indisponible : préparation verrouillée.</p>':`<div class="veto-list">${state.games.filter(g=>g.proposed_by!==state.me.id && (vetoCounts[g.proposed_by]||0)<2).map(g=>`<button class="veto" data-veto="${g.id}">🚫 ${esc(g.name)}</button>`).join('')}</div>`}</div>`;
  $('#gameForm')?.addEventListener('submit',addGame);
  document.querySelectorAll('.saveVotes').forEach(b=>b.onclick=()=>saveVotes(b.dataset.player));
  document.querySelectorAll('[data-veto]').forEach(b=>b.onclick=()=>castVeto(b.dataset.veto));
}
async function addGame(e){
  e.preventDefault();const name=$('#gameName').value.trim();const normalized=norm(name);
  if(state.games.some(g=>g.normalized_name===normalized))return $('#app').insertAdjacentHTML('afterbegin',flash(`Jeu déjà proposé par ${state.players.find(p=>p.id===state.games.find(g=>g.normalized_name===normalized).proposed_by)?.name||'un autre joueur'}.`));
  const {error}=await sb.from('games').insert({name,normalized_name:normalized,proposed_by:state.me.id});
  if(error)return $('#app').insertAdjacentHTML('afterbegin',flash(error.message));
  await loadData();renderPreparation();
}
async function saveVotes(playerId){
  const games=state.games.filter(g=>g.proposed_by===playerId);const vals=games.map(g=>Number(document.querySelector(`[data-game="${g.id}"]`).value));
  if(vals.some(v=>!v)||[...new Set(vals)].length!==5)return alert('Il faut utiliser exactement 1, 2, 3, 4 et 5.');
  for(let i=0;i<games.length;i++){const {error}=await sb.from('game_votes').upsert({voter_id:state.me.id,game_id:games[i].id,priority:vals[i]});if(error)return alert(error.message);}
  await loadData();renderPreparation();
}
async function castVeto(gameId){
  if(!confirm('Confirmer ce veto ? Il sera définitif.'))return;
  const {error}=await sb.from('vetos').insert({player_id:state.me.id,game_id:gameId});
  if(error)return alert(error.message);
  await loadData();renderPreparation();
}
function autoSelected(){
  const out=[];
  for(const p of state.players){
    const gs=state.games.filter(g=>g.proposed_by===p.id && !state.vetos.some(v=>v.game_id===g.id));
    const scored=gs.map(g=>({g,score:state.votes.filter(v=>v.game_id===g.id).reduce((s,v)=>s+(6-v.priority),0)})).sort((a,b)=>b.score-a.score||a.g.created_at.localeCompare(b.g.created_at));
    out.push(...scored.slice(0,3).map(x=>x.g));
  }
  return out;
}
function renderAdmin(){
  const selected=state.finals.map(f=>f.game_id);const auto=autoSelected();
  $('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">ADMINISTRATION</div><h1>Tableau de contrôle</h1></div><span class="badge">${state.players.length}/5 joueurs</span></div>
  <div class="card"><h2>État</h2><p>Préparation : <b>${state.settings?.preparation_locked?'verrouillée':'ouverte'}</b></p><p>Jeux proposés : <b>${state.games.length}/25</b></p><p>Jeux retenus : <b>${state.finals.length}/15</b></p><div class="actions">${!state.settings?.preparation_locked?`<button class="button" id="autoSelect">Calculer automatiquement les 15 jeux</button>`:''}<button class="button secondary" id="lockPrep">${state.settings?.preparation_locked?'Réouvrir la préparation':'Verrouiller la préparation'}</button></div></div>
  <div class="card"><h2>Sélection manuelle des 15 jeux</h2><p>Exactement 3 jeux par joueur. La sélection ci-dessous remplacera la sélection actuelle.</p><div class="admin-grid">${state.players.flatMap(p=>state.games.filter(g=>g.proposed_by===p.id).map(g=>`<label class="checkgame"><input type="checkbox" class="finalCheck" data-proposer="${p.id}" value="${g.id}" ${selected.includes(g.id)?'checked':''}>${esc(g.name)}</label>`)).join('')}</div><button class="button" id="saveManual">Enregistrer les 15 jeux</button></div>
  <div class="card"><h2>Résultats saisis</h2><p>${state.results.length} résultats individuels enregistrés.</p></div>`;
  $('#autoSelect')?.addEventListener('click',async()=>{if(auto.length!==15)return alert('Impossible de produire 15 jeux : vérifiez les 5 listes, les votes et les vetos.');await saveFinals(auto,true);});
  $('#saveManual')?.addEventListener('click',async()=>{const ids=[...document.querySelectorAll('.finalCheck:checked')].map(x=>x.value);if(ids.length!==15)return alert('Il faut sélectionner exactement 15 jeux.');for(const p of state.players){const n=ids.filter(id=>state.games.find(g=>g.id===id)?.proposed_by===p.id).length;if(n!==3)return alert(`${p.name} doit avoir exactement 3 jeux sélectionnés.`);}await saveFinals(ids.map(id=>state.games.find(g=>g.id===id)),false);});
  $('#lockPrep')?.addEventListener('click',toggleLock);
}
async function saveFinals(games,automatic){
  await sb.from('final_games').delete().neq('position',0);
  for(let i=0;i<games.length;i++){const {error}=await sb.from('final_games').insert({game_id:games[i].id,position:i+1,selected_automatically:automatic,admin_modified:!automatic});if(error)return alert(error.message);}
  await sb.from('admin_logs').insert({admin_id:state.me.id,action:automatic?'auto_selection':'manual_selection',details:{game_ids:games.map(g=>g.id)}});
  await loadData();renderAdmin();
}
async function toggleLock(){
  const v=!state.settings.preparation_locked;
  if(v && !confirm('Verrouiller la préparation ? Les joueurs ne pourront plus modifier leurs jeux, votes ou vetos.'))return;
  const {error}=await sb.from('tournament_settings').update({preparation_locked:v}).eq('id',1);
  if(error)return alert(error.message);await loadData();renderAdmin();
}
function renderTournament(){
  if(!state.finals.length)return $('#app').innerHTML=`<div class="card"><h1>Tournoi</h1><p>Les 15 jeux n'ont pas encore été sélectionnés.</p></div>`;
  const resultsByGame={};state.results.forEach(r=>(resultsByGame[r.game_id]??=[]).push(r));
  const standings=state.players.map(p=>({p,points:state.results.filter(r=>r.player_id===p.id).reduce((s,r)=>s+r.points,0)})).sort((a,b)=>b.points-a.points);
  $('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 2</div><h1>Le tournoi</h1></div><span class="badge">${standings.map((x,i)=>`${i+1}. ${x.p.avatar} ${esc(x.p.name)} · ${x.points} pts`).join(' · ')}</span></div>
  <div class="card table-scroll"><table class="tournament"><thead><tr><th>Jeu</th>${state.players.map(p=>`<th>${p.avatar}<br>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${state.finals.map(f=>{const rs=resultsByGame[f.game_id]||[];return `<tr><td><a href="#/result/${f.game_id}"><b>${f.position}. ${esc(f.games.name)}</b></a></td>${state.players.map(p=>{const r=rs.find(x=>x.player_id===p.id);return `<td>${r?`<span class="rank r${r.rank}">${r.rank}</span><br><small>${r.points} pt</small>`:'—'}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`;
}
async function renderResult(gameId){
  const f=state.finals.find(x=>x.game_id===gameId);if(!f)return renderTournament();
  const existing=state.results.filter(r=>r.game_id===gameId);
  const mine=existing.find(r=>r.player_id===state.me.id);
  $('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">RÉSULTAT</div><h1>${f.position}. ${esc(f.games.name)}</h1><p>Indiquez votre classement sur ce jeu.</p><div class="notice">1er = 5 pts · 2e = 4 pts · 3e = 3 pts · 4e = 2 pts · 5e = 1 pt</div><form id="resultForm"><label>Mon classement<select id="rank" required><option value="">Choisir…</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${mine?.rank===n?'selected':''}>${n}e place · ${POINTS[n]} point(s)</option>`).join('')}</select></label><button class="button">Enregistrer</button></form><p class="muted">Résultats actuellement saisis : ${existing.length}/5.</p><a href="#/tournoi">← Retour au tournoi</a></div>`;
  $('#resultForm').onsubmit=async e=>{e.preventDefault();const rank=Number($('#rank').value);const {error}=mine?await sb.from('results').update({rank,points:POINTS[rank],updated_at:new Date().toISOString()}).eq('game_id',gameId).eq('player_id',state.me.id):await sb.from('results').insert({game_id:gameId,player_id:state.me.id,rank,points:POINTS[rank],entered_by:state.me.id,is_admin_edit:false});if(error)return alert(error.message);await loadData();location.hash='/tournoi';render();};
}
function renderStats(){
  const stats=state.players.map(p=>{const rs=state.results.filter(r=>r.player_id===p.id);return {p,rs,points:rs.reduce((s,r)=>s+r.points,0),wins:rs.filter(r=>r.rank===1).length,podiums:rs.filter(r=>r.rank<=3).length};});
  $('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 3</div><h1>Statistiques</h1></div></div><div class="card"><label>Choisir un joueur<select id="statPlayer">${stats.map(s=>`<option value="${s.p.id}">${s.p.avatar} ${esc(s.p.name)}</option>`).join('')}</select></label><div id="statDetail"></div></div>`;
  function detail(id){const s=stats.find(x=>x.p.id===id)||stats[0];if(!s)return;$('#statDetail').innerHTML=`<div class="player-card"><span class="big">${s.p.avatar}</span><div><h2>${esc(s.p.name)}</h2><span class="muted">${s.rs.length} jeu(x) joué(s)</span></div></div><div class="stats-grid"><div><small>Points</small><b>${s.points}</b></div><div><small>Victoires</small><b>${s.wins}</b></div><div><small>Podiums</small><b>${s.podiums}</b></div><div><small>Dernière place</small><b>${s.rs.filter(r=>r.rank===5).length}</b></div></div><h3>Répartition des places</h3><p>🥇 ${s.rs.filter(r=>r.rank===1).length} · 🥈 ${s.rs.filter(r=>r.rank===2).length} · 🥉 ${s.rs.filter(r=>r.rank===3).length} · 4e ${s.rs.filter(r=>r.rank===4).length} · 5e ${s.rs.filter(r=>r.rank===5).length}</p>`;}
  $('#statPlayer').onchange=e=>detail(e.target.value);detail(stats[0]?.p.id);
}
window.addEventListener('hashchange',async()=>{if(state.user)await loadData();renderNav();render();});
sb.auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;if(state.user)await loadData();else state.me=null;renderNav();render();});

if(location.hash.startsWith('#/result/')){
  (async()=>{await load();const id=location.hash.split('/')[2];if(state.user)await renderResult(id);})();
}else{load();}
