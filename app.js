import {initializeApp} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,updateProfile,signOut} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,addDoc,query,orderBy,where,writeBatch,deleteDoc,updateDoc} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const cfg=window.TIRLIBIBI_CONFIG||{}, app=initializeApp(cfg), auth=getAuth(app), db=getFirestore(app);
const AVATARS=['🎲','🧙','🏴‍☠️','🦊','🤖','👑','🐼','🦄','🐉','🧝','🧛','👽','🐸'];
const POINTS={1:5,2:4,3:3,4:2,5:1};
let state={user:null,me:null,isAdmin:false,players:[],games:[],finals:[],votes:[],veto:null,vetos:[],results:[],availability:[],settings:{preparation_locked:false}};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const norm=s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const flash=(m,t='error')=>`<div class="flash ${t}">${esc(m)}</div>`;
const now=()=>new Date().toISOString();
const route=()=>location.hash.replace(/^#/,'')||'/';

async function admin(uid){const s=await getDoc(doc(db,'admins',uid));return s.exists()&&s.data().enabled!==false}
async function loadData(){
  const uid=state.user.uid, ps=await getDoc(doc(db,'players',uid));
  if(!ps.exists()) await setDoc(doc(db,'players',uid),{id:uid,email:state.user.email||'',name:state.user.displayName||((state.user.email||'').split('@')[0]),avatar:'🎲',is_admin:false,created_at:now()});
  state.me=(await getDoc(doc(db,'players',uid))).data();
  state.isAdmin=await admin(uid); state.me.is_admin=state.isAdmin;

  state.players=(await getDocs(query(collection(db,'players'),orderBy('created_at')))).docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.email&&!p.is_admin);
  state.games=(await getDocs(query(collection(db,'games'),orderBy('created_at')))).docs.map(d=>({id:d.id,...d.data()}));
  state.finals=(await getDocs(query(collection(db,'final_games'),orderBy('position')))).docs.map(d=>({id:d.id,...d.data()})).map(f=>({...f,games:state.games.find(g=>g.id===f.game_id)})).filter(f=>f.games);
  const v=state.isAdmin?await getDocs(collection(db,'game_votes')):await getDocs(query(collection(db,'game_votes'),where('voter_id','==',uid)));
  state.votes=v.docs.map(d=>({id:d.id,...d.data()}));
  const myv=await getDocs(query(collection(db,'vetos'),where('player_id','==',uid))); state.veto=myv.docs[0]?{id:myv.docs[0].id,...myv.docs[0].data()}:null;
  state.vetos=(await getDocs(collection(db,'vetos'))).docs.map(d=>({id:d.id,...d.data()}));
  state.results=(await getDocs(collection(db,'results'))).docs.map(d=>({id:d.id,...d.data()}));
  const ss=await getDoc(doc(db,'tournament_settings','main')); if(ss.exists())state.settings=ss.data();
}
async function load(){if(!cfg.apiKey||cfg.apiKey.includes('COLLER_ICI')){$('#app').innerHTML=`<div class="card narrow"><h2>⚙️ Configuration à terminer</h2><p>Dans <b>config.js</b>, collez la clé API de l'application Web Firebase.</p></div>`;return} if(state.user)await loadData();renderNav();render()}
function renderNav(){const n=$('#nav');if(!state.user){n.innerHTML=`<a href="#/login">Connexion</a><a href="#/register" class="button">Participer</a>`;return}n.innerHTML=`<a href="#/">Accueil</a><a href="#/preparation">Préparation</a><a href="#/tournoi">Tournoi</a><a href="#/stats">Stats</a><a href="#/calendrier">Calendrier</a>${state.isAdmin?'<a href="#/admin">⚙️ Admin</a>':''}<a href="#" id="logout">Déconnexion</a>`;$('#logout')?.addEventListener('click',async e=>{e.preventDefault();await signOut(auth);location.hash='/'})}
async function render(){const r=route();if(r==='/login')return login();if(r==='/register')return register();if(!state.user)return home();if(!state.me)return profile();if(r==='/preparation')return prep();if(r==='/tournoi')return tournament();if(r.startsWith('/result/'))return result(r.split('/')[2]);if(r==='/stats')return stats();if(r==='/calendrier')return calendar();if(r==='/admin'&&state.isAdmin)return adminPage();home()}

const IMAGE_PICKER_CSS = `
<style id="tir-image-picker-css">
.tir-image-modal{position:fixed;inset:0;background:rgba(18,18,18,.68);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
.tir-image-box{background:#fffdf8;border-radius:18px;max-width:900px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.tir-image-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
.tir-image-head h2{margin:3px 0 0;font-size:25px}
.tir-image-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.tir-image-choice{border:1px solid #ddd4c6;border-radius:12px;background:#fff;padding:8px;cursor:pointer;text-align:left;transition:.15s}
.tir-image-choice:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.12);border-color:#d86b3e}
.tir-image-choice img{width:100%;height:190px;object-fit:contain;background:#f3f0ea;border-radius:8px;display:block}
.tir-image-title{font-size:12px;font-weight:700;margin-top:7px;line-height:1.25}
.tir-image-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
.tir-game-line{display:flex;align-items:center;gap:10px}
.tir-my-games{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.tir-my-game-item{display:grid;grid-template-columns:28px 58px minmax(0,1fr) auto;align-items:center;column-gap:16px;padding:10px 12px;border:1px solid #e5ddd0;border-radius:12px;background:#fffdf9;min-height:84px}
.tir-my-game-item .tir-game-thumb{width:58px!important;height:72px!important;max-width:58px!important;max-height:72px!important;object-fit:contain;border-radius:7px;background:#f0ece4;display:block}
.tir-my-game-item .tir-game-name{font-size:16px;line-height:1.25;font-weight:700;min-width:0;overflow-wrap:anywhere}
.tir-my-game-item .tir-delete-game{margin-left:0!important;white-space:nowrap;padding:8px 12px}
.tir-my-game-number{font-weight:700;text-align:center;color:#6d6257}
@media(max-width:600px){.tir-my-game-item{grid-template-columns:24px 50px minmax(0,1fr);column-gap:10px}.tir-my-game-item .tir-game-thumb{width:50px!important;height:62px!important;max-width:50px!important;max-height:62px!important}.tir-my-game-item .tir-delete-game{grid-column:3;justify-self:start;margin-top:4px!important}.tir-my-game-item{padding:9px 8px}}

.tir-game-thumb{width:42px;height:52px;object-fit:contain;border-radius:6px;background:#f0ece4;flex:0 0 auto}
.tir-game-thumb.big{width:58px;height:70px}
.tir-game-cover{width:54px;height:68px;object-fit:contain;border-radius:7px;background:#f0ece4;vertical-align:middle;margin-right:8px}
@media(max-width:760px){.tir-image-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tir-image-choice img{height:160px}.tir-image-box{padding:16px}}
</style>`;

function ensureImagePickerCss(){
  if(!document.querySelector('#tir-image-picker-css')) document.body.insertAdjacentHTML('beforeend',IMAGE_PICKER_CSS);
}

function gameImage(g, cls='tir-game-thumb'){
  return g?.image_url ? `<img class="${cls}" src="${esc(g.image_url)}" alt="${esc(g.name||'')}" loading="lazy">` : `<span class="${cls}" style="display:inline-flex;align-items:center;justify-content:center;font-size:22px">🎲</span>`;
}

function imageText(value){
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}

function imageSearchScore(title, gameName, description=''){
  const t=norm(imageText(title)), n=norm(gameName), d=norm(imageText(description));
  let s=0;
  if(t===n)s+=300;
  if(t.startsWith(n+' '))s+=220;
  if(t.includes(n))s+=150;
  const nt=n.split(' ').filter(x=>x.length>2);
  const matched=nt.filter(w=>t.includes(w)).length;
  s+=matched*20;
  if(/\b(jeu de société|jeu de plateau|board game|tabletop game|strategy board game|card game)\b/i.test(d))s+=120;
  if(/\b(box cover|box art|cover artwork|front cover|boîte|boite|box|cover|couverture)\b/i.test(t+' '+d))s+=100;
  if(/\b(dancing|dance|person|people|woman|man|score|scoring|points|tournament|expo|event|tableau|championship|costume|cosplay|pdf|poster|affiche|festival|convention|meeting|photograph|gameplay|playthrough|setup|spilplan|spelplan|end of game)\b/i.test(t+' '+d))s-=180;
  return s;
}

function boardGameDescription(text=''){
  return /\b(jeu de société|jeu de plateau|jeu de cartes|board game|tabletop game|strategy board game|card game)\b/i.test(imageText(text));
}

async function wikipediaSummary(lang,title){
  try{
    const url=`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g,'_'))}`;
    const r=await fetch(url,{headers:{'Accept':'application/json'}});
    if(!r.ok)return null;
    const j=await r.json();
    const desc=imageText(j.description||'');
    const extract=imageText(j.extract||'');
    const text=desc+' '+extract;
    const thumb=j.originalimage?.source || j.thumbnail?.source;
    if(!thumb || !boardGameDescription(text))return null;
    const score=imageSearchScore(j.title||title,title,text);
    return {
      id:String(j.pageid||j.title||title),
      title:j.title||title,
      url:thumb,
      score,
      source:'wikipedia',
      page_url:j.content_urls?.desktop?.page||`https://${lang}.wikipedia.org/wiki/${encodeURIComponent((j.title||title).replace(/ /g,'_'))}`,
      description:desc||extract.slice(0,180)
    };
  }catch(e){return null}
}

async function searchWikipediaDirect(gameName){
  const variants=[
    gameName,
    `${gameName} (jeu)`,
    `${gameName} (jeu de société)`,
    `${gameName} (board game)`,
    `${gameName} board game`
  ];
  const found=[];
  for(const lang of ['fr','en']){
    for(const title of variants){
      const x=await wikipediaSummary(lang,title);
      if(x)found.push(x);
    }
  }
  const unique=new Map();
  found.forEach(x=>{const k=x.page_url||x.title;if(!unique.has(k)||x.score>unique.get(k).score)unique.set(k,x)});
  return [...unique.values()].sort((a,b)=>b.score-a.score).slice(0,6);
}

async function mediaWikiPageSearch(lang, gameName){
  const base=`https://${lang}.wikipedia.org/w/api.php`;
  const queries=[
    `"${gameName}" "jeu de société"`,
    `"${gameName}" "board game"`,
    `${gameName} jeu de société`,
    `${gameName} board game`
  ];
  const pages=new Map();
  for(const q of queries){
    try{
      const u=base+'?action=query&list=search&srnamespace=0&srsearch='+encodeURIComponent(q)+'&srlimit=8&format=json&origin=*';
      const r=await fetch(u); if(!r.ok) continue;
      const j=await r.json();
      for(const hit of (j.query?.search||[])) if(!pages.has(hit.pageid)) pages.set(hit.pageid,hit);
    }catch(e){}
  }
  const rows=[];
  for(const hit of [...pages.values()].slice(0,12)){
    const x=await wikipediaSummary(lang,hit.title);
    if(x)rows.push(x);
  }
  return rows;
}

async function searchWikipediaGames(gameName){
  // Priorité absolue à la fiche Wikipedia du jeu : pour beaucoup de jeux,
  // sa vignette principale est précisément la couverture de la boîte.
  const direct=await searchWikipediaDirect(gameName);
  if(direct.length) return direct;
  const all=[];
  for(const lang of ['fr','en']) all.push(...await mediaWikiPageSearch(lang,gameName));
  const unique=new Map();
  all.forEach(x=>{const k=x.page_url||x.title;if(!unique.has(k)||x.score>unique.get(k).score)unique.set(k,x)});
  return [...unique.values()].filter(x=>x.score>=180).sort((a,b)=>b.score-a.score).slice(0,6);
}

async function searchCommonsFallback(gameName){
  // Secours uniquement : Commons contient souvent des photos de parties,
  // donc on exige des indices très forts d'une boîte/couverture et on pénalise
  // fortement les photos de plateau.
  const queries=[
    `"${gameName}" "box cover"`,
    `"${gameName}" "front cover"`,
    `"${gameName}" "boîte"`,
    `"${gameName}" "board game" box`
  ];
  const all=new Map();
  for(const q of queries){
    try{
      const u='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch='+encodeURIComponent(q)+'&gsrlimit=30&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=520&format=json&origin=*';
      const r=await fetch(u); if(!r.ok) continue;
      const j=await r.json();
      Object.values(j.query?.pages||{}).forEach(p=>{
        const ii=p.imageinfo?.[0], title=(p.title||'').replace(/^File:/i,'');
        if(!ii) return;
        const md=ii.extmetadata||{};
        const desc=imageText(md.ImageDescription?.value||'');
        const cats=imageText(md.Categories?.value||'');
        const searchable=title+' '+desc+' '+cats;
        const n=norm(gameName), hay=norm(searchable);
        const words=n.split(' ').filter(x=>x.length>2);
        const close=hay.includes(n) || (words.length && words.filter(w=>hay.includes(w)).length>=Math.max(1,Math.ceil(words.length*.8)));
        if(!close)return;
        const explicitBox=/\b(box cover|front cover|cover art|box art|boite|boîte|box|couverture)\b/i.test(searchable);
        const setup=/\b(gameplay|playthrough|setup|score|scoring|spilplan|spelplan|end of game|expansion|players?)\b/i.test(searchable);
        if(!explicitBox || setup)return;
        let score=imageSearchScore(title,gameName,desc+' '+cats)+120;
        const w=Number(ii.width||0),h=Number(ii.height||0),ratio=w&&h?w/h:0;
        if(ratio>1.45)score-=80;
        if(ratio>=0.65&&ratio<=1.45)score+=25;
        const url=ii.thumburl||ii.url;
        if(!url)return;
        all.set(p.pageid,{id:String(p.pageid),title,url,score,source:'wikimedia_commons',page_url:ii.descriptionurl||null,description:desc.slice(0,180)});
      });
    }catch(e){}
  }
  return [...all.values()].sort((a,b)=>b.score-a.score).slice(0,6);
}

async function searchGameImages(gameName){
  const wiki=await searchWikipediaGames(gameName);
  if(wiki.length) return wiki;
  return await searchCommonsFallback(gameName);
}

function pickGameImage(gameName){
  ensureImagePickerCss();
  return new Promise(async resolve=>{
    const old=document.querySelector('.tir-image-modal'); old?.remove();
    const modal=document.createElement('div');
    modal.className='tir-image-modal';
    modal.innerHTML=`<div class="tir-image-box">
      <div class="tir-image-head"><div><div class="eyebrow">IMAGE DU JEU</div><h2>Choisir la boîte de « ${esc(gameName)} »</h2><p class="muted">Je cherche d’abord la fiche du jeu et sa couverture de boîte. Les photos de plateau sont volontairement écartées.</p></div><button class="button light tir-close">Fermer</button></div>
      <div class="tir-image-content"><p class="muted">Recherche de la boîte du jeu…</p></div>
      <div class="tir-image-actions"><button class="button light tir-none">Continuer sans image</button></div>
    </div>`;
    document.body.appendChild(modal);
    let done=false;
    const finish=v=>{if(done)return;done=true;modal.remove();resolve(v)};
    modal.querySelector('.tir-close').onclick=()=>finish(null);
    modal.querySelector('.tir-none').onclick=()=>finish(null);
    const results=await searchGameImages(gameName);
    const content=modal.querySelector('.tir-image-content');
    if(!results.length){
      content.innerHTML=`<div class="notice">Aucune boîte suffisamment fiable n'a été trouvée pour « ${esc(gameName)} ». Tu peux continuer sans image.</div>`;
      return;
    }
    content.innerHTML=`<div class="tir-image-grid">${results.map((r,i)=>`<button type="button" class="tir-image-choice" data-i="${i}"><img src="${esc(r.url)}" alt="Boîte ${esc(gameName)}" loading="lazy"><div class="tir-image-title">${esc(r.title)}</div><div class="muted" style="font-size:11px;margin-top:3px">${r.source==='wikipedia'?'Fiche Wikipédia':'Wikimedia Commons'}</div></button>`).join('')}</div>`;
    modal.querySelectorAll('.tir-image-choice').forEach(b=>b.onclick=()=>finish(results[Number(b.dataset.i)]));
  });
}

function home(){$('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">SAISON 1 · 5 JOUEURS · 15 JEUX</div><h1>Le Grand <strong>Tournoi</strong> des Tirlibibi</h1><p>Choisissez vos jeux, votez, utilisez votre veto… puis affrontez-vous sur les 15 jeux retenus.</p><div class="actions">${state.user?'<a class="button" href="#/preparation">Entrer dans le tournoi</a>':'<a class="button" href="#/register">Créer mon joueur</a><a class="button light" href="#/login">Me connecter</a>'}</div></div><div class="dice">🎲</div></section><div class="card"><h2>Les joueurs</h2><div class="players">${state.players.map(p=>`<div class="player"><span class="avatar">${p.avatar}</span><b>${esc(p.name)}</b></div>`).join('')||'<span class="muted">Les joueurs apparaîtront ici.</span>'}</div></div>${state.finals.length?`<div class="card"><h2>Les 15 jeux du tournoi</h2><div class="game-grid">${state.finals.map(f=>`<article class="game"><div class="cover">${f.games.image_url?`<img src="${esc(f.games.image_url)}" alt="">`:'🎲'}</div><b>${f.position}. ${esc(f.games.name)}</b><small class="muted">${esc(state.players.find(p=>p.id===f.games.proposed_by)?.name||'')}</small></article>`).join('')}</div></div>`:''}`}
function login(){$('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">CONNEXION</div><h1>Bienvenue</h1><form id="f"><label>Email<input id="email" type="email" required></label><label>Mot de passe<input id="password" type="password" required></label><button class="button">Se connecter</button></form><p class="muted">Pas encore inscrit ? <a href="#/register">Créer mon compte</a></p></div>`;$('#f').onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);location.hash='/'}catch(x){$('#app').insertAdjacentHTML('afterbegin',flash(x.message))}}}
function register(){$('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">INSCRIPTION</div><h1>Je rejoins le tournoi</h1><form id="f"><label>Prénom / pseudo<input id="name" maxlength="40" required></label><label>Email<input id="email" type="email" required></label><label>Mot de passe<input id="password" type="password" minlength="6" required></label><label>Mon avatar</label><div class="avatars">${AVATARS.map((a,i)=>`<label class="avatar-choice"><input type="radio" name="avatar" value="${a}" ${i?'':'checked'}><span>${a}</span></label>`).join('')}</div><button class="button">Créer mon compte</button></form><p class="muted">Le tournoi est limité à 5 joueurs.</p></div>`;$('#f').onsubmit=async e=>{e.preventDefault();try{if((await getDocs(collection(db,'players'))).docs.filter(d=>!d.data().is_admin).length>=5)throw Error('Les 5 places du tournoi sont déjà prises.');const name=$('#name').value.trim(),email=$('#email').value.trim().toLowerCase(),password=$('#password').value,avatar=document.querySelector('[name=avatar]:checked').value,c=await createUserWithEmailAndPassword(auth,email,password);const existing=await getDocs(collection(db,'players'));if(existing.docs.filter(d=>!d.data().is_admin&&d.data().email).length>=5){await signOut(auth);throw Error('Les 5 places du tournoi sont déjà prises.')}await updateProfile(c.user,{displayName:name});await setDoc(doc(db,'players',c.user.uid),{id:c.user.uid,email,name,avatar,is_admin:false,created_at:now()});location.hash='/'}catch(x){$('#app').insertAdjacentHTML('afterbegin',flash(x.message))}}}
function profile(){$('#app').innerHTML=`<div class="card narrow"><h2>Profil à finaliser</h2><p>Votre compte existe mais votre profil joueur n'a pas pu être chargé.</p></div>`}
function prep(){const mine=state.games.filter(g=>g.proposed_by===state.me.id),others=state.players.filter(p=>p.id!==state.me.id).map(p=>({...p,games:state.games.filter(g=>g.proposed_by===p.id)})),locked=state.settings.preparation_locked,vmap=Object.fromEntries(state.votes.map(v=>[v.game_id,v.priority])),counts={};state.vetos.forEach(v=>{const g=state.games.find(x=>x.id===v.game_id);if(g)counts[g.proposed_by]=(counts[g.proposed_by]||0)+1});$('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 1</div><h1>Préparation</h1></div><span class="badge">${mine.length}/5 jeux proposés</span></div>${locked?flash('La préparation est verrouillée.','success'):''}<div class="card"><h2>1. Mes 5 jeux</h2><p class="muted">Chaque jeu doit être différent de tous les autres.</p>${!locked&&mine.length<5?`<form id="gf" class="inline-form"><input id="gn" placeholder="Nom du jeu de société" required><button class="button">Ajouter le jeu</button></form>`:''}<ol class="tir-my-games">${mine.map((g,i)=>`<li class="tir-my-game-item"><span class="tir-my-game-number">${i+1}.</span>${gameImage(g)}<b class="tir-game-name">${esc(g.name)}</b>${!locked?`<button type="button" class="button light tir-delete-game" data-delete-game="${g.id}" title="Supprimer ce jeu">🗑️ Supprimer</button>`:''}</li>`).join('')}</ol></div><div class="card"><h2>2. Je classe les jeux des autres joueurs</h2><p>Pour chaque liste, utilisez obligatoirement 1, 2, 3, 4 et 5.</p>${others.map(p=>`<section><h3>${p.avatar} ${esc(p.name)}</h3>${p.games.length<5?`<p class="ko">Cette liste n'est pas encore complète.</p>`:p.games.map(g=>`<div class="vote-row"><span class="tir-game-line">${gameImage(g)}<span>${esc(g.name)}</span></span><select data-game="${g.id}"><option value="">Priorité…</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${vmap[g.id]===n?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}${p.games.length===5&&!locked?`<button class="button light sv" data-player="${p.id}">Enregistrer ce classement</button>`:''}</section>`).join('')}</div><div class="card"><h2>3. Mon veto</h2><p>Un seul veto pour tout le tournoi. Une liste ne peut recevoir que 2 vetos.</p>${state.veto?`<div class="notice">Veto utilisé sur : <span class="tir-game-line" style="display:inline-flex">${gameImage(state.games.find(g=>g.id===state.veto.game_id),'tir-game-thumb')}<b>${esc(state.games.find(g=>g.id===state.veto.game_id)?.name||'')}</b></span></div>`:locked?'<p class="muted">Veto indisponible : préparation verrouillée.</p>':`<div class="veto-list">${state.games.filter(g=>g.proposed_by!==state.me.id&&(counts[g.proposed_by]||0)<2).map(g=>`<button class="veto" data-veto="${g.id}">${g.image_url?`<img class="tir-game-cover" src="${esc(g.image_url)}" alt="">`:'🎲'} 🚫 ${esc(g.name)}</button>`).join('')}</div>`}</div>`;$('#gf')?.addEventListener('submit',addGame);document.querySelectorAll('.sv').forEach(b=>b.onclick=()=>votes(b.dataset.player));document.querySelectorAll('[data-veto]').forEach(b=>b.onclick=()=>veto(b.dataset.veto));document.querySelectorAll('[data-delete-game]').forEach(b=>b.onclick=()=>deleteGame(b.dataset.deleteGame))}
async function addGame(e){e.preventDefault();if(state.settings.preparation_locked)return;const name=$('#gn').value.trim(),normalized=norm(name),mine=state.games.filter(g=>g.proposed_by===state.me.id);if(mine.length>=5)return alert('Vous avez déjà proposé 5 jeux.');const old=state.games.find(g=>g.normalized_name===normalized);if(old)return $('#app').insertAdjacentHTML('afterbegin',flash(`Jeu déjà proposé par ${state.players.find(p=>p.id===old.proposed_by)?.name||'un autre joueur'}.`));const image=await pickGameImage(name);await addDoc(collection(db,'games'),{name,normalized_name:normalized,proposed_by:state.me.id,created_at:now(),image_url:image?.url||null,image_thumb_url:image?.url||null,image_source:image?.source||null,image_id:image?.id||null,image_title:image?.title||null,image_page_url:image?.page_url||null});await loadData();prep()}
async function deleteGame(gid){
  if(state.settings.preparation_locked)return;
  const g=state.games.find(x=>x.id===gid);
  if(!g||g.proposed_by!==state.me.id)return;
  if(!confirm(`Supprimer « ${g.name} » de votre liste ?\n\nVous pourrez ensuite ajouter un autre jeu.`))return;
  await deleteDoc(doc(db,'games',gid));
  await loadData();
  prep();
}
async function votes(pid){const gs=state.games.filter(g=>g.proposed_by===pid),vals=gs.map(g=>Number(document.querySelector(`[data-game="${g.id}"]`).value));if(vals.length!==5||vals.some(v=>!v)||new Set(vals).size!==5)return alert('Il faut utiliser exactement 1, 2, 3, 4 et 5.');const b=writeBatch(db);gs.forEach((g,i)=>b.set(doc(db,'game_votes',`${state.me.id}_${g.id}`),{voter_id:state.me.id,game_id:g.id,priority:vals[i],created_at:now()}));await b.commit();await loadData();prep()}
async function veto(gid){if(state.veto)return alert('Vous avez déjà utilisé votre veto.');if(!confirm('Confirmer ce veto ? Il sera définitif.'))return;const g=state.games.find(x=>x.id===gid);if(!g||g.proposed_by===state.me.id)return;const n=state.vetos.filter(v=>state.games.find(x=>x.id===v.game_id)?.proposed_by===g.proposed_by).length;if(n>=2)return alert('Cette liste a déjà reçu 2 vetos.');await setDoc(doc(db,'vetos',state.me.id),{player_id:state.me.id,game_id:gid,created_at:now()});await loadData();prep()}
function auto(){return state.players.flatMap(p=>state.games.filter(g=>g.proposed_by===p.id&&!state.vetos.some(v=>v.game_id===g.id)).map(g=>({g,s:state.votes.filter(v=>v.game_id===g.id).reduce((a,v)=>a+6-v.priority,0)})).sort((a,b)=>b.s-a.s||a.g.created_at.localeCompare(b.g.created_at)).slice(0,3).map(x=>x.g))}
function adminPage(){const sel=state.finals.map(f=>f.game_id),a=auto();$('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">ADMINISTRATION</div><h1>Tableau de contrôle</h1></div><span class="badge">${state.players.length}/5 joueurs</span></div><div class="card"><h2>État</h2><p>Préparation : <b>${state.settings.preparation_locked?'verrouillée':'ouverte'}</b></p><p>Jeux proposés : <b>${state.games.length}/25</b></p><p>Jeux retenus : <b>${state.finals.length}/15</b></p><div class="actions">${!state.settings.preparation_locked?'<button class="button" id="auto">Calculer automatiquement les 15 jeux</button>':''}<button class="button secondary" id="lock">${state.settings.preparation_locked?'Réouvrir la préparation':'Verrouiller la préparation'}</button></div></div><div class="card"><h2>Sélection manuelle des 15 jeux</h2><p>Exactement 3 jeux par joueur.</p><div class="admin-grid">${state.players.flatMap(p=>state.games.filter(g=>g.proposed_by===p.id).map(g=>`<label class="checkgame"><input type="checkbox" class="fc" value="${g.id}" ${sel.includes(g.id)?'checked':''}>${gameImage(g)}${esc(g.name)}</label>`)).join('')}</div><button class="button" id="manual">Enregistrer les 15 jeux</button></div><div class="card"><h2>Résultats saisis</h2><p>${state.results.length} résultats individuels enregistrés.</p></div>`;$('#auto')?.addEventListener('click',()=>a.length===15?saveFinals(a,true):alert('Impossible de produire 15 jeux : vérifiez les listes, votes et vetos.'));$('#manual')?.addEventListener('click',()=>{const ids=[...document.querySelectorAll('.fc:checked')].map(x=>x.value);if(ids.length!==15)return alert('Il faut sélectionner exactement 15 jeux.');if(state.players.some(p=>ids.filter(id=>state.games.find(g=>g.id===id)?.proposed_by===p.id).length!==3))return alert('Il faut exactement 3 jeux par joueur.');saveFinals(ids.map(id=>state.games.find(g=>g.id===id)),false)});$('#lock').onclick=lock}
async function saveFinals(gs,automatic){const old=await getDocs(collection(db,'final_games')),b=writeBatch(db);old.docs.forEach(d=>b.delete(d.ref));gs.forEach((g,i)=>b.set(doc(db,'final_games',g.id),{game_id:g.id,position:i+1,selected_automatically:automatic,admin_modified:!automatic,created_at:now()}));b.set(doc(db,'admin_logs',`${Date.now()}_${state.me.id}`),{admin_id:state.me.id,action:automatic?'auto_selection':'manual_selection',created_at:now(),details:{game_ids:gs.map(g=>g.id)}});await b.commit();await loadData();adminPage()}
async function lock(){const v=!state.settings.preparation_locked;if(v&&!confirm('Verrouiller la préparation ?'))return;await setDoc(doc(db,'tournament_settings','main'),{preparation_locked:v,updated_at:now()},{merge:true});await loadData();adminPage()}
function tournament(){if(!state.finals.length)return $('#app').innerHTML=`<div class="card"><h1>Tournoi</h1><p>Les 15 jeux n'ont pas encore été sélectionnés.</p></div>`;const by={};state.results.forEach(r=>(by[r.game_id]??=[]).push(r));const st=state.players.map(p=>({p,pts:state.results.filter(r=>r.player_id===p.id).reduce((a,r)=>a+r.points,0)})).sort((a,b)=>b.pts-a.pts);$('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 2</div><h1>Le tournoi</h1></div><span class="badge">${st.map((x,i)=>`${i+1}. ${x.p.avatar} ${esc(x.p.name)} · ${x.pts} pts`).join(' · ')}</span></div><div class="card table-scroll"><table class="tournament"><thead><tr><th>Jeu</th>${state.players.map(p=>`<th>${p.avatar}<br>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${state.finals.map(f=>{const rs=by[f.game_id]||[];return `<tr><td><a href="#/result/${f.game_id}" class="tir-game-line">${gameImage(f.games,'tir-game-thumb')}<b>${f.position}. ${esc(f.games.name)}</b></a></td>${state.players.map(p=>{const r=rs.find(x=>x.player_id===p.id);return `<td>${r?`<span class="rank r${r.rank}">${r.rank}</span><br><small>${r.points} pt</small>`:'—'}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`}
function result(gid){const f=state.finals.find(x=>x.game_id===gid);if(!f)return tournament();const ex=state.results.filter(r=>r.game_id===gid),mine=ex.find(r=>r.player_id===state.me.id);$('#app').innerHTML=`<div class="card narrow"><div class="eyebrow">RÉSULTAT</div><h1 class="tir-game-line">${gameImage(f.games,'tir-game-thumb big')}<span>${f.position}. ${esc(f.games.name)}</span></h1><p>Indiquez votre classement sur ce jeu.</p><div class="notice">1er = 5 pts · 2e = 4 pts · 3e = 3 pts · 4e = 2 pts · 5e = 1 pt</div><form id="rf"><label>Mon classement<select id="rank" required><option value="">Choisir…</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${mine?.rank===n?'selected':''}>${n}e place · ${POINTS[n]} point(s)</option>`).join('')}</select></label><button class="button">Enregistrer</button></form><p class="muted">Résultats actuellement saisis : ${ex.length}/5.</p><a href="#/tournoi">← Retour au tournoi</a></div>`;$('#rf').onsubmit=async e=>{e.preventDefault();const r=Number($('#rank').value),used=ex.find(x=>x.rank===r&&x.player_id!==state.me.id);if(used)return alert('Cette place est déjà attribuée pour ce jeu.');await setDoc(doc(db,'results',`${gid}_${state.me.id}`),{game_id:gid,player_id:state.me.id,rank:r,points:POINTS[r],entered_by:state.me.id,is_admin_edit:false,updated_at:now()},{merge:true});await loadData();location.hash='/tournoi';render()}}
async function calendar(){
  let av=[];
  try{av=(await getDocs(collection(db,'availability'))).docs.map(d=>({id:d.id,...d.data()}));}
  catch(e){return $('#app').innerHTML=`<div class="card"><h1>📅 Calendrier</h1>${flash(`Impossible de charger le calendrier : ${e.message}`)}</div>`}
  const by={}; av.forEach(a=>(by[a.date]??=[]).push(a.player_id));
  const today=new Date(), start=new Date(today.getFullYear(),today.getMonth(),1);
  const days=[];
  const todayOnly=new Date(today.getFullYear(),today.getMonth(),today.getDate());for(let k=0;k<3;k++){const m=new Date(start.getFullYear(),start.getMonth()+k,1),last=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();for(let n=1;n<=last;n++){const d=new Date(m.getFullYear(),m.getMonth(),n);if(d>=todayOnly)days.push(d);}}
  const fmt=d=>d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const full=days.filter(d=>(by[d.toISOString().slice(0,10)]||[]).length===5);
  const rows=days.map(d=>{const date=d.toISOString().slice(0,10),ids=by[date]||[],mine=ids.includes(state.user.uid);return `<tr class="${ids.length===5?'calendar-full':''}"><td><b>${fmt(d)}</b></td><td><button class="button ${mine?'secondary':''} cal-btn" data-date="${date}">${mine?'✓ Disponible':'Je suis disponible'}</button></td><td><b>${ids.length}/5</b><div>${state.players.map(p=>ids.includes(p.id)?`<span title="${esc(p.name)}">${p.avatar}</span>`:'').join(' ')||'—'}</div></td></tr>`}).join('');
  $('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">RENCONTRE DU TOURNOI</div><h1>📅 Calendrier</h1></div><span class="badge">${av.filter(a=>a.player_id===state.user.uid).length} date(s) cochée(s)</span></div><div class="card"><h2>Trouvons une date pour jouer ensemble</h2><p class="muted">Clique sur les dates où tu es disponible. Les disponibilités des cinq joueurs sont visibles par tous.</p>${full.length?`<div class="notice success">🎯 <b>Les 5 joueurs sont disponibles :</b><br>${full.map(fmt).join('<br>')}</div>`:'<div class="notice">🎯 Les dates à <b>5/5</b> apparaîtront ici automatiquement.</div>'}</div><div class="card table-scroll"><table class="tournament calendar-table"><thead><tr><th>Date</th><th>Ma disponibilité</th><th>Disponibles</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  document.querySelectorAll('.cal-btn').forEach(b=>b.onclick=async()=>{const date=b.dataset.date,uid=state.user.uid,id=`${uid}_${date}`,mine=av.find(a=>a.player_id===uid&&a.date===date);try{if(mine)await deleteDoc(doc(db,'availability',id));else await setDoc(doc(db,'availability',id),{player_id:uid,date,created_at:now()});calendar()}catch(e){alert(`Erreur : ${e.message}`)}});
}
function stats(){const s=state.players.map(p=>{const r=state.results.filter(x=>x.player_id===p.id);return{p,r,pts:r.reduce((a,x)=>a+x.points,0),w:r.filter(x=>x.rank===1).length,pod:r.filter(x=>x.rank<=3).length}});$('#app').innerHTML=`<div class="page-head"><div><div class="eyebrow">MODULE 3</div><h1>Statistiques</h1></div></div><div class="card"><label>Choisir un joueur<select id="sp">${s.map(x=>`<option value="${x.p.id}">${x.p.avatar} ${esc(x.p.name)}</option>`).join('')}</select></label><div id="sd"></div></div>`;const detail=id=>{const x=s.find(y=>y.p.id===id)||s[0];if(!x)return;const avg=x.r.length?(x.pts/x.r.length).toFixed(2):'—';$('#sd').innerHTML=`<div class="player-card"><span class="big">${x.p.avatar}</span><div><h2>${esc(x.p.name)}</h2><span class="muted">${x.r.length} jeu(x) joué(s)</span></div></div><div class="stats-grid"><div><small>Points</small><b>${x.pts}</b></div><div><small>Moyenne / jeu</small><b>${avg}</b></div><div><small>Victoires</small><b>${x.w}</b></div><div><small>Podiums</small><b>${x.pod}</b></div></div><p>🥇 ${x.r.filter(r=>r.rank===1).length} · 🥈 ${x.r.filter(r=>r.rank===2).length} · 🥉 ${x.r.filter(r=>r.rank===3).length} · 4e ${x.r.filter(r=>r.rank===4).length} · 5e ${x.r.filter(r=>r.rank===5).length}</p><div class="game-grid">${x.r.map(r=>{const g=state.games.find(y=>y.id===r.game_id);return g?`<article class="game"><div class="tir-game-line">${gameImage(g,'tir-game-cover')}<div><b>${esc(g.name)}</b><br><small>${r.rank}e · ${r.points} pt</small></div></div></article>`:''}).join('')}</div>`};$('#sp').onchange=e=>detail(e.target.value);detail(s[0]?.p.id)}
window.addEventListener('hashchange',async()=>{if(state.user)await loadData();renderNav();render()});
onAuthStateChanged(auth,async u=>{state.user=u||null;if(state.user)try{await loadData()}catch(e){console.error(e);$('#app').innerHTML=flash(`Erreur Firebase : ${e.message}`)}else{state.me=null;state.isAdmin=false}renderNav();render()});
