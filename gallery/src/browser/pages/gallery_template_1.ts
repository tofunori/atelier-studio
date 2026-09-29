import type {GalleryRow, GalleryColumn, GalleryPresentation, FigureStroke, AnnotationSession, FigureHistory} from "../../contracts/gallery";

(function(){
  try{ var m=(location.hash||'').match(/atelier_nonce=([\w-]+)/); if(m){ sessionStorage.setItem('atelier_nonce', m[1]); window.__atelierNonce = m[1]; } }catch(e){}
  /* nonce IPC : inclus dans chaque message vers l'app hôte ; l'app rejette sans lui */
  window.__atelierPost = function(p){
    try{ p = Object.assign({}, p, {nonce: (window.__atelierNonce || sessionStorage.getItem('atelier_nonce') || '')}); }catch(e){}
    try{ window.top.postMessage(p, '*'); }catch(e){}
  };
  /* onglet masqué (display:none) : document.hidden ne bouge pas (PIEGES_CONNUS §4) ;
     l'app poste atelier-tab-visibility pour que les sondes /rev et /state se taisent
     (même mécanisme que atelier_theme.js pour les éditeurs) */
  var tabHidden=false;
  try{
    var hd=Object.getOwnPropertyDescriptor(Document.prototype,'hidden'), vd=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState');
    if(hd&&hd.get&&vd&&vd.get){
      Object.defineProperty(document,'hidden',{configurable:true,get:function(){return tabHidden||hd.get.call(document);}});
      Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return tabHidden?'hidden':vd.get.call(document);}});
    }
  }catch(e){}
  window.addEventListener('message',function(e){
    if(e.source!==window.parent||!e.data||e.data.type!=='atelier-tab-visibility') return;
    var next=e.data.visible===false;
    if(next===tabHidden) return;
    tabHidden=next;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  function notifyPaneFocus(){
    if(window.parent !== window) window.__atelierPost({type:'atelier-pane-focus'});
  }
  document.addEventListener('pointerdown', notifyPaneFocus, true);
  document.addEventListener('focusin', notifyPaneFocus, true);
  window.addEventListener('focus', notifyPaneFocus);
  /* réadoption : le sessionStorage des iframes peut être purgé par WKWebView →
     nonce perdu = clics muets. Les messages du parent (thème, activation)
     portent le nonce : on le réadopte quand le nôtre a disparu. */
  window.addEventListener('message', function(e){
    if(e.source !== window.top && e.source !== window.parent) return;
    var d = e.data;
    if(d && typeof d.nonce === 'string' && d.nonce && !window.__atelierNonce){
      window.__atelierNonce = d.nonce;
      try{ sessionStorage.setItem('atelier_nonce', d.nonce); }catch(err){}
    }
  });
})();

const INLINE_FILES = __DATA__;
let FILES = Array.isArray(INLINE_FILES) ? INLINE_FILES : [];
let FOLDERS = Array.isArray(__FOLDERS__) ? __FOLDERS__ : [];
let SEED_FAVS = Array.isArray(__FAVS__) ? __FAVS__ : [];
let galleryDataLoaded = Array.isArray(INLINE_FILES);
const galleryCommandsReady=import('/.fig_thumbs/gallery_commands.js?v=__VER__')
  .then(()=>window.AtelierGalleryCommands).catch(()=>null);

/* shadcn gallery adapter: this generated page cannot import React/Base UI,
   but it exposes the same semantic slots and state attributes. That keeps the
   iframe, standalone page and editor surfaces on one inspectable contract. */
function applyShadcnGalleryContract(root: Document|HTMLElement){
  const scope=root&&root.querySelectorAll?root:document;
  const set=(selector: string,slot: string)=>scope.querySelectorAll(selector).forEach((el)=>{
    if(!(el as HTMLElement).dataset.slot) (el as HTMLElement).dataset.slot=slot;
  });
  set('button','button');
  set('input:not([type="checkbox"]):not([type="color"]),textarea','input');
  set('.menu','dropdown-menu-content');
  set('.menu .mi','dropdown-menu-item');
  set('.menu .mhd','dropdown-menu-label');
  set('.card','card');
  set('.skel','skeleton');
}
applyShadcnGalleryContract(document);
function applyShadcnGalleryContractNode(node: HTMLElement){
  applyShadcnGalleryContract(node);
  if(node.matches?.('button')&&!node.dataset.slot) node.dataset.slot='button';
  if(node.matches?.('.menu')) node.dataset.slot='dropdown-menu-content';
  if(node.matches?.('.card')) node.dataset.slot='card';
  if(node.matches?.('.skel')) node.dataset.slot='skeleton';
}
// coalescence : un re-render de grille ajoute ~600 cartes d'un coup — appliquer
// le contrat UNE fois par lot de mutations, et sur document.body dès que le lot
// est gros (600 querySelectorAll ciblés coûteraient plus cher qu'un global)
let contractQueued=false;
const contractRoots=new Set<HTMLElement>();
new MutationObserver(mutations=>{
  for(const mutation of mutations)
    for(const node of mutation.addedNodes)
      if(node.nodeType===1) contractRoots.add(node as HTMLElement);
  if(contractQueued||!contractRoots.size) return;
  contractQueued=true;
  queueMicrotask(()=>{
    contractQueued=false;
    const roots=[...contractRoots];
    contractRoots.clear();
    if(roots.length>20){ applyShadcnGalleryContract(document.body); return; }
    for(const node of roots) if(node.isConnected) applyShadcnGalleryContractNode(node);
  });
}).observe(document.body,{childList:true,subtree:true});
function foldersFromFiles(files){
  return [...new Set((files||[]).map((f)=>f.folder||'.'))].sort();
}
function applyGalleryData(data){
  if(Array.isArray(data)) data={files:data};
  if(!data || !Array.isArray(data.files)) return;
  FILES = data.files;
  FOLDERS = Array.isArray(data.folders) ? data.folders : foldersFromFiles(FILES);
  SEED_FAVS = Array.isArray(data.favs) ? data.favs : [];
  galleryDataLoaded = true;
  if(data.title) document.title=data.title;
  const wm=document.querySelector<HTMLSpanElement>('.brand .wm'); if(wm && data.wordmark) wm.textContent=data.wordmark;
  const pj=document.querySelector<HTMLSpanElement>('.brand .proj'); if(pj && data.project) pj.textContent=data.project;
  const stat=(document.getElementById('galleryStat') as HTMLSpanElement);
  if(stat) stat.textContent=(data.countLabel || String(FILES.length))+' files · '+(data.gen||'');
  if(typeof favs!=='undefined'){
    SEED_FAVS.forEach((f)=>favs.add(f));
    saveFavs();
    (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
  }
  if(typeof populateFolders==='function') populateFolders();
  if(typeof render==='function') render();
}
if(!galleryDataLoaded){
  // skeleton pendant le chargement des données (coquille)
  const g=(document.getElementById('grid') as HTMLElement);
  if(g && !g.children.length) g.innerHTML='<div class="skel"></div>'.repeat(10);
  fetch('/data',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(applyGalleryData).catch(()=>{});
}
// selects custom : cache le natif, bouton + menu maison, proxy vers le <select>
(function(){
  let selectMenuId=0;
  document.querySelectorAll<HTMLSelectElement>('select#sort, select#folder').forEach(sel=>{
    sel.style.display='none';
    const btn=document.createElement('button');
    const menuId='gallery-select-'+(++selectMenuId);
    btn.type='button'; btn.className='csel-btn'; btn.dataset.slot='select-trigger';
    btn.setAttribute('aria-haspopup','listbox'); btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-controls',menuId);
    btn.setAttribute('aria-label',sel.getAttribute('aria-label')||'Choose an option');
    const sync=()=>{ btn.textContent=sel.options[sel.selectedIndex]?.text ?? ''; };
    sel.insertAdjacentElement('afterend',btn); sync();
    sel.addEventListener('change',sync);
    new MutationObserver(sync).observe(sel,{childList:true}); // options repeuplées (folders)
    let menu: HTMLDivElement=null;
    const close=(returnFocus=false)=>{ if(menu){menu.remove();menu=null;btn.setAttribute('aria-expanded','false');document.removeEventListener('mousedown',out,true);if(returnFocus)btn.focus();} };
    const out=(e)=>{ if(menu && !menu.contains(e.target) && e.target!==btn) close(); };
    const open=()=>{
      if(menu) return;
      menu=document.createElement('div'); menu.className='menu csel-menu'; menu.style.display='block';
      menu.id=menuId; menu.dataset.slot='select-content'; menu.setAttribute('role','listbox');
      [...sel.options].forEach((o,i)=>{
        const it=document.createElement('div');
        if(i===sel.selectedIndex) it.classList.add('on');
        it.dataset.slot='select-item'; it.setAttribute('role','option'); it.tabIndex=-1;
        it.setAttribute('aria-selected',i===sel.selectedIndex?'true':'false');
        it.innerHTML='<span class="ck">✓</span>';
        it.appendChild(document.createTextNode(o.text));
        it.onclick=()=>{ sel.selectedIndex=i; sel.dispatchEvent(new Event('change',{bubbles:true})); close(); };
        it.onkeydown=event=>{
          if(event.key==='Enter'||event.key===' '){event.preventDefault();it.click();return;}
          if(event.key==='Escape'){event.preventDefault();close(true);return;}
          if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            event.preventDefault();
            const items=[...menu.querySelectorAll<HTMLElement>('[role="option"]')],step=event.key==='ArrowDown'?1:-1;
            items[(items.indexOf(it)+step+items.length)%items.length].focus();
          }
        };
        menu.appendChild(it);
      });
      document.body.appendChild(menu);
      btn.setAttribute('aria-expanded','true');
      const r=btn.getBoundingClientRect(), mh=Math.min(340, menu.scrollHeight||340);
      const below=innerHeight-r.bottom-8>=mh;
      menu.style.left=Math.min(r.left, innerWidth-menu.offsetWidth-8)+'px';
      menu.style.top=(below?r.bottom+4:Math.max(8,r.top-mh-4))+'px';
      document.addEventListener('mousedown',out,true);
      ((menu.querySelector<HTMLElement>('[aria-selected="true"]')||menu.firstElementChild) as HTMLElement)?.focus();
    };
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      if(menu){close();return;}
      open();
    });
    btn.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
  });
})();
// densité S/M/L persistée
(function(){
  const seg=(document.getElementById('densitySeg') as HTMLSpanElement); if(!seg) return;
  const D={s:['150px','110px'],m:['185px','150px'],l:['240px','190px']};
  function apply(d: string){ const v=D[d]||D.m;
    document.documentElement.style.setProperty('--card-min',v[0]);
    document.documentElement.style.setProperty('--thumb-h',v[1]);
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.classList.toggle('on',b.dataset.d===d)); }
  seg.addEventListener('click',e=>{ const d=(e.target as HTMLElement).dataset?.d; if(!d) return;
    localStorage.setItem('galleryDensity',d); apply(d); });
  apply(localStorage.getItem('galleryDensity')||'m');
})();
// Filenames are untrusted: escape for text (esc) and attributes (escA), and route
// every card handler through delegation on data-* (never JS-string interpolation).
function truncMid(name: string,max: number){
  if(name.length<=max) return name;
  const dot=name.lastIndexOf('.');
  const ext=dot>0?name.slice(dot):'';
  const stem=dot>0?name.slice(0,dot):name;
  const keep=max-ext.length-1;
  return stem.slice(0,Math.ceil(keep*0.6))+'…'+stem.slice(-Math.floor(keep*0.4))+ext;
}
// Flex truncates the prefix, while the distinguishing suffix and extension
// keep their space. Unlike a character limit, this follows the card width.
function fileNameLabel(name: string){
  const dot=name.lastIndexOf('.');
  const stem=dot>0?name.slice(0,dot):name;
  const ext=dot>0?name.slice(dot):'';
  const split=Math.max(0,stem.length-12);
  return '<span class="nm-prefix">'+esc(stem.slice(0,split))+'</span>'
    +'<span class="nm-tail"><span>'+esc(stem.slice(split))+'</span></span>'
    +'<span class="nm-ext">'+esc(ext)+'</span>';
}
function esc(s: string){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function escA(s: string){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function chatAttachment(rel: string){
  const name=rel.split('/').pop()||rel;
  const ext=(name.split('.').pop()||'').toLowerCase();
  const path='__ROOT__/'+rel;
  const payload: {type: string; path: string; name: string; text: string; previewUrl?: string}={type:'atelier-add-to-chat',path,name,
    text:path+'\nFichier joint depuis la galerie atelier — lis-le (outil Read) avant de répondre.'};
  if(['png','jpg','jpeg','gif','webp','svg'].includes(ext)) payload.previewUrl=new URL(rel,location.href).href;
  return payload;
}
const pendingChatAcks=new Map();
window.addEventListener('message',e=>{
  const data=e.data;
  if(e.source!==window.top || !data || data.type!=='atelier-add-to-chat-ack') return;
  // Même source de nonce que __atelierPost : WKWebView peut neutraliser
  // sessionStorage.setItem, et lire le nonce ici seul jetait tous les ACK.
  let nonce=window.__atelierNonce||'';
  try{nonce=nonce||sessionStorage.getItem('atelier_nonce')||'';}catch{}
  if(!nonce || data.nonce!==nonce || typeof data.ok!=='boolean') return;
  const pending=pendingChatAcks.get(data.requestId); if(!pending) return;
  clearTimeout(pending.timer); pendingChatAcks.delete(data.requestId);
  if(data.ok) pending.resolve();
  else pending.reject(new Error(typeof data.error==='string'?data.error:'Ajout refusé'));
});
function postChatAttachment(rel){ return postChatPayload(chatAttachment(rel)); }
// Même canal que « Add to chat » et que l'annotation d'image : postMessage
// atelier-add-to-chat + ACK borné. Généralisé pour que le panneau Provenance
// puisse envoyer SON message (Régénérer / Reconstruire) sans dupliquer la
// mécanique de relance.
function postChatPayload(base){
  const requestId=(crypto.randomUUID?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(16).slice(2)));
  const payload=Object.assign({type:'atelier-add-to-chat'},base,{requestId});
  return new Promise((resolve,reject)=>{
    const pending={resolve,reject,timer:0 as ReturnType<typeof setTimeout>|number,attempt:0};
    pendingChatAcks.set(requestId,pending);
    const send=()=>{
      pending.attempt++;
      __atelierPost(payload);
      pending.timer=setTimeout(()=>{
        if(pending.attempt<3){ send(); return; }
        pendingChatAcks.delete(requestId);
        reject(new Error('atelier-add-to-chat-ack timeout'));
      },450*pending.attempt);
    };
    send();
  });
}
// Barre d'actions des cartes : icônes SVG monochromes (stroke 1.4, 15px) —
// remplace les libellés texte et les glyphes Unicode ★ ⋯ ▦ </>, qui sortaient
// du système de design (deux alphabets, lignes de base qui ondulent).
const HOV_ICONS={
  open:'<path d="M9.5 2.5h4v4"/><path d="M13.5 2.5 8 8"/><path d="M12 9.8V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.2"/>',
  copy:'<path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l2-2a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3l-2 2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1"/>',
  chat:'<path d="M13.5 9.2a1.3 1.3 0 0 1-1.3 1.3H5.6L3 13V4.1a1.3 1.3 0 0 1 1.3-1.3h7.9a1.3 1.3 0 0 1 1.3 1.3z"/>',
  src:'<path d="M5.6 4.8 2.4 8l3.2 3.2"/><path d="M10.4 4.8 13.6 8l-3.2 3.2"/>',
  board:'<rect x="2.4" y="2.9" width="11.2" height="10.2" rx="1.2"/><path d="M2.4 6.6h11.2M8 6.6v6.5"/>',
  fav:'<path class="fill" d="M8 2.2l1.75 3.6 3.95.57-2.85 2.8.67 3.94L8 11.25l-3.52 1.86.67-3.94-2.85-2.8 3.95-.57z"/>',
  more:'<circle cx="3.2" cy="8" r=".65" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".65" fill="currentColor" stroke="none"/><circle cx="12.8" cy="8" r=".65" fill="currentColor" stroke="none"/>',
  ok:'<path d="M3.2 8.4 6.4 11.6 12.8 4.8"/>',
  ko:'<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/>',
  wait:'<circle cx="8" cy="8" r="5.4"/><path d="M8 5.2V8l1.9 1.4"/>'
};
const hovIco=(n)=>'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+HOV_ICONS[n]+'</svg>';
// Les retours d'action (✓ / ✗ / …) sont eux aussi des icônes : on remplace le
// contenu, jamais le textContent — sinon le SVG du bouton disparaît.
function hovFlash(el, name: string, ms: number){
  if(!el) return;
  if(el.dataset.hovBack===undefined) el.dataset.hovBack=el.innerHTML;
  el.innerHTML=hovIco(name);
  clearTimeout(el._hovT);
  if(ms) el._hovT=setTimeout(()=>{ el.innerHTML=el.dataset.hovBack; delete el.dataset.hovBack; }, ms);
}
const EMB = new URLSearchParams(location.search).get('embedded')==='atelier' || window.self!==window.top;
document.addEventListener('click',e=>{
  const el=(e.target as Element).closest<HTMLElement>('[data-act]'); if(!el) return;
  const rel=el.dataset.rel, act=el.dataset.act;
  if(act==='fav') toggleFav(rel, el);
  else if(act==='sel') toggleSel(rel, el, e);
  else if(act==='hide') toggleHide(rel);
  else if(act==='del') delOne(rel);
  // Les figures s'ouvrent directement dans le viewer, quel que soit l'hôte.
  // Le panneau latéral réduisait inutilement l'espace disponible pour l'image.
  else if(act==='lb'){ closeInspector(false); lbOpen(rel); }
  else if(act==='open'){
    if(EMB || el.tagName==='BUTTON') openInContext(rel); else selectCard(rel);
  }
  else if(act==='src') findScript(rel);
  else if(act==='board') sendToBoard(rel, el);
  else if(act==='more'){ e.stopImmediatePropagation(); cardMenu(el, rel); }
  else if(act==='rate') setRate(rel, +el.dataset.n, e);
  else if(act==='copy'){ navigator.clipboard.writeText(rel); hovFlash(el,'ok',1200); }
  else if(act==='chat'){
    // Un redémarrage peut remonter la galerie avant que l'hôte écoute les
    // postMessage. Ne montrer ✓ qu'après l'ACK réel, avec relance bornée.
    if(el.dataset.addState) return;
    el.dataset.addState='pending'; hovFlash(el,'wait',0);
    postChatAttachment(rel).then(()=>{
      el.dataset.addState='added'; hovFlash(el,'ok',1200);
      setTimeout(()=>{ delete el.dataset.addState; },1200);
    }).catch(()=>{
      hovFlash(el,'ko',1200); delete el.dataset.addState;
      el.title='Add to chat was not received — click to retry';
    });
  }
});
let favs = new Set(JSON.parse(localStorage.getItem('figFavs')||'[]'));
SEED_FAVS.forEach((f)=>favs.add(f));
const saveFavs = ()=>localStorage.setItem('figFavs', JSON.stringify([...favs]));
saveFavs();
const THEMES = {
  'Encre':        {bg:'#1a1917',card:'#232220',card2:'#121110',txt:'#e8e5db',muted:'#948f85',accent:'#cc785c',border:'#332f2a',arch:'#3a2f1a'},
  'Profond':      {bg:'#1e1d1b',card:'#292724',card2:'#161513',txt:'#ece9e1',muted:'#9a968c',accent:'#d97757',border:'#37342e',arch:'#3a2f1a'},
  'Charbon':      {bg:'#211f1c',card:'#2b2926',card2:'#1a1815',txt:'#eae7de',muted:'#9d988d',accent:'#e08a63',border:'#38352f',arch:'#3a2f1a'},
  'Neutre chaud': {bg:'#1c1c1a',card:'#272623',card2:'#151513',txt:'#e9e7df',muted:'#98958c',accent:'#d97757',border:'#34322d',arch:'#3a2f1a'},
  'Très foncé':   {bg:'#171614',card:'#201f1c',card2:'#100f0d',txt:'#e6e3d9',muted:'#8f8b81',accent:'#d97757',border:'#2e2b26',arch:'#3a2f1a'},
  'Default':   {bg:'#1e2124',card:'#24282d',card2:'#2c2f34',txt:'#dadee3',muted:'#90969d',accent:'#e77f3e',border:'#2a2d31',arch:'#3a2f1a'},
  'Codex':     {bg:'#282c34',card:'#2f343f',card2:'#21252b',txt:'#abb2bf',muted:'#7f848e',accent:'#4d78cc',border:'#3e4451',arch:'#3a2f1a'},
  'Dracula':   {bg:'#282a36',card:'#343746',card2:'#21222c',txt:'#f8f8f2',muted:'#9aa0b3',accent:'#bd93f9',border:'#44475a',arch:'#3a2f1a'},
  'Nord':      {bg:'#2e3440',card:'#3b4252',card2:'#272c36',txt:'#e5e9f0',muted:'#9aa3b2',accent:'#88c0d0',border:'#434c5e',arch:'#3a2f1a'}
};
// Embarquée dans l'app : le thème appartient à l'hôte (message postMessage
// 'atelier-theme' plus bas) — ne jamais lire/écrire figTheme ni appliquer un
// thème du catalogue local, sous peine de flash d'une palette étrangère puis
// de désync au premier clic dans le menu Réglages.
let theme = EMB ? 'Default' : (localStorage.getItem('figTheme') || 'Default');
function applyTheme(name: string){
  if(!THEMES[name]) name='Default';
  theme=name;
  if(!EMB){ try{ localStorage.setItem('figTheme',name); }catch(e){} }
  const t=THEMES[name], r=document.documentElement.style;
  for(const k in t) r.setProperty('--'+k, t[k]);
}
applyTheme(theme);
let hidden = new Set(JSON.parse(localStorage.getItem('figHidden')||'[]'));
let showHidden = false;
const saveHidden = ()=>{localStorage.setItem('figHidden', JSON.stringify([...hidden]));pushState();};
function updateHideChip(){ updateViewChip(); }
function toggleHide(rel: unknown){if(hidden.has(rel))hidden.delete(rel);else hidden.add(rel);saveHidden();updateHideChip();render();}
let ratings = JSON.parse(localStorage.getItem('figRatings')||'{}');
let stateTimer: string|number|NodeJS.Timeout=null, stateLoaded=false, pendingPush=false;
let favsBase=[], stateSaving=false;
const initialFavoriteBaseline=new Set(favs);
function pushState(){
  if(!stateLoaded || stateSaving){ pendingPush=true; return; }   // never POST before the initial /state merge lands (a partial save would clobber disk)
  clearTimeout(stateTimer);
  stateTimer=setTimeout(()=>{
    stateTimer=null; stateSaving=true;
    const sentFavs=[...favs];
    fetch('/state',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({favs:sentFavs,favsBase,ratings,hidden:[...hidden],tags,hideRules,collections,workflow,
        // Filtre de types du PROJET : le localStorage du WebView meurt à chaque
        // relance de l'app (PIEGES_CONNUS §1) — le disque fait foi, comme pour
        // les favoris. N'est envoyé qu'une fois un choix EXPLICITE fait, sinon
        // les défauts intégrés resteraient figés au premier chargement.
        fileTypes: formatFilterExplicit?galleryActiveTypeKeys():null,
        pinnedTypes:pinnedFileTypes, filePresets:customFilePresets, presentation:{...galleryPresentation,widths:detailWidths}})}).then(r=>{
          if(!r.ok) throw new Error('state save failed');
          favsBase=sentFavs;
        }).catch(()=>{pendingPush=true;}).finally(()=>{
          stateSaving=false;
          if(pendingPush){pendingPush=false;pushState();}
        });
  },400);
}
let favoriteReadRevision=0;
setInterval(async()=>{
  if(document.hidden || !stateLoaded || stateSaving || stateTimer || pendingPush) return;
  const before=JSON.stringify([...favs]), revision=++favoriteReadRevision;
  try {
    const response=await fetch('/state');
    if(!response.ok) return;
    const state=await response.json();
    if(revision!==favoriteReadRevision || stateSaving || stateTimer || pendingPush || before!==JSON.stringify([...favs])) return;
    const next=Array.isArray(state.favs)?state.favs:[];
    favsBase=next;
    if(JSON.stringify([...favs].sort())===JSON.stringify([...next].sort())) return;
    favs=new Set(next);saveFavs();
    (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
    render();
  } catch {}
},5000);
const saveRatings = ()=>{localStorage.setItem('figRatings', JSON.stringify(ratings));pushState();};
// --- tags / collections + rule-based (smart) hiding ---------------------------
let tags = JSON.parse(localStorage.getItem('figTags')||'{}');            // {rel:[tag,...]}
let collections = JSON.parse(localStorage.getItem('figCollections')||'{}'); // {name:[rel,...]}
let activeCollection = '';
// --- workflow scientifique : draft → candidate → final / rejected ------------
// source durable = .fig_state.json (serveur) ; localStorage n'est qu'un cache
let workflow: Record<string,string> = JSON.parse(localStorage.getItem('figWorkflow')||'{}');    // {rel: status}
const WORKFLOW_STATUSES = [['draft','Draft'],['candidate','Candidate'],['final','Final'],['rejected','Rejected']];
let activeWorkflow = '';
const validWorkflow = (v) => WORKFLOW_STATUSES.some(([s])=>s===v);
function saveWorkflow(){ localStorage.setItem('figWorkflow', JSON.stringify(workflow)); pushState(); }
function setWorkflow(rel: string|number, val){
  if(!validWorkflow(val)) delete workflow[rel]; else workflow[rel]=val;
  saveWorkflow(); buildWorkflowChip(); render();
}
let hideRules = JSON.parse(localStorage.getItem('figHideRules')||'[]');  // glob strings
const _ruleRe = {};
function ruleToRe(g: string){                                  // gitignore-ish glob -> RegExp
  if(_ruleRe[g]) return _ruleRe[g];
  const onBase = !g.includes('/');                     // no slash -> match basename at any depth
  let s = g.replace(/[.+^${}()|[\]\\]/g,'\\$&')   // escape regex specials, keep * ? for glob
           .replace(/\*\*/g,'@@D@@').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]')
           .replace(/@@D@@\//g,'(?:.*/)?').replace(/@@D@@/g,'.*');
  const o = {re:new RegExp('^'+s+'$'), onBase}; _ruleRe[g]=o; return o;
}
function matchesRule(rel: string|string[]){
  if(!hideRules.length) return false;
  const base = rel.slice(rel.lastIndexOf('/')+1);
  return hideRules.some((g)=>{ const o=ruleToRe(g); return o.re.test(o.onBase?base:rel); });
}
function saveRules(){ localStorage.setItem('figHideRules', JSON.stringify(hideRules)); for(const k in _ruleRe) delete _ruleRe[k]; pushState(); }
fetch('/state').then(r=>r.json()).then(st=>{
  const localAdded=[...favs].filter(f=>!initialFavoriteBaseline.has(f));
  const localRemoved=[...initialFavoriteBaseline].filter(f=>!favs.has(f));
  favsBase=Array.isArray(st.favs)?st.favs:[];
  favs=new Set(favsBase);
  localAdded.forEach(f=>favs.add(f));localRemoved.forEach(f=>favs.delete(f));
  Object.assign(ratings, st.ratings||{});
  hidden = new Set(st.hidden||[]);   // server (.fig_state.json) is authoritative — else localStorage resurrects un-hidden files
  if(st.tags) tags = st.tags;
  if(st.hideRules) hideRules = st.hideRules;
  if(st.collections) collections = st.collections;
  if(st.workflow && typeof st.workflow==='object' && !Array.isArray(st.workflow)){
    // le serveur est la source de vérité : remplacer le cache par les valeurs validées
    workflow = {};
    for(const [rel,v] of Object.entries(st.workflow)) if(validWorkflow(v)) workflow[rel]=v as string;
  }
  for(const k in _ruleRe) delete _ruleRe[k];
  // Filtre de types : présent sur disque = choix du projet, il gagne sur le
  // cache local (et sur les défauts intégrés). Absent = jamais choisi ici.
  if(Array.isArray(st.fileTypes)){
    const wanted=st.fileTypes.filter((k)=>TYPE_LIST.some(([e])=>e===k));
    Object.keys(exts).forEach(k=>exts[k]=false);
    wanted.forEach((k)=>typeGroup(k).forEach(g=>exts[g]=true));
    setFormatFilterExplicit(true);
    saveExts();
  }
  if(Array.isArray(st.pinnedTypes)){
    pinnedFileTypes=st.pinnedTypes.filter((k)=>TYPE_LIST.some(([e])=>e===k));
    localStorage.setItem(pinnedTypesKey, JSON.stringify(pinnedFileTypes));
  }
  if(Array.isArray(st.filePresets)){
    customFilePresets=st.filePresets.filter((p)=>p&&p.id&&p.label&&Array.isArray(p.extensions));
    localStorage.setItem(customPresetsKey, JSON.stringify(customFilePresets));
  }
  if(st.presentation && !presentationTouched) restorePresentation(st.presentation);
  buildFmtMenu(); fmtChipLabel(); galleryFileTypesChanged();
  localStorage.setItem('figFavs', JSON.stringify([...favs]));
  localStorage.setItem('figRatings', JSON.stringify(ratings));
  localStorage.setItem('figHidden', JSON.stringify([...hidden]));
  localStorage.setItem('figTags', JSON.stringify(tags));
  localStorage.setItem('figHideRules', JSON.stringify(hideRules));
  localStorage.setItem('figCollections', JSON.stringify(collections));
  localStorage.setItem('figWorkflow', JSON.stringify(workflow));
  (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
  updateHideChip(); buildCollectionChip(); buildWorkflowChip(); buildViewMenu();
  render();
}).catch(()=>{}).finally(()=>{
  stateLoaded=true;                                 // disk state is merged in now; saves are safe
  if(pendingPush){ pendingPush=false; pushState(); }
});
function setRate(rel: string|number, n: number, ev: PointerEvent){
  ev.stopPropagation();
  if(ratings[rel]===n) delete ratings[rel]; else ratings[rel]=n;
  saveRatings(); render();
}
const rateRow = (rel) => {
  const r = ratings[rel]||0;
  return '<div class="rate" title="Rate 1–5 (click again to clear)">'+
    [1,2,3,4,5].map(i=>`<span class="${i<=r?'on':''}" data-act="rate" data-rel="${escA(rel)}" data-n="${i}">${i<=r?'★':'☆'}</span>`).join('')+'</div>';
};
let onlyFavs = false;
let rateMin = 0;
const selSet = new Set<string>();
let chatFocusRels = new Set();
let lastSelRel = null;     // anchor for Shift-click range selection
let renderedRels: string[] = [];     // rels in current display order (for range math)
function updateDelBtn(){
  const bar=(document.getElementById('selBar') as HTMLDivElement);
  if(bar) bar.classList.toggle('on', selSet.size>0);
  const b = (document.getElementById('delSel') as HTMLButtonElement);
  b.style.display = selSet.size ? '' : 'none';
  const imgs = [...selSet].filter(r => imgExt(r.split('.').pop().toLowerCase()));
  const c = (document.getElementById('cmpSel') as HTMLButtonElement);
  c.style.display = imgs.length >= 2 ? '' : 'none';
  c.textContent = '▤ Compare (' + imgs.length + ')';
  (document.getElementById('clrSel') as HTMLButtonElement).style.display = selSet.size ? '' : 'none';
  const h = (document.getElementById('hideSel') as HTMLButtonElement);
  h.style.display = selSet.size ? '' : 'none';
  h.textContent = 'Hide (' + selSet.size + ')';
  const co = (document.getElementById('collectSel') as HTMLButtonElement);
  co.style.display = selSet.size ? '' : 'none';
  co.textContent = 'Collect (' + selSet.size + ')';
  const ex = (document.getElementById('exportSel') as HTMLButtonElement);
  ex.style.display = selSet.size ? '' : 'none';
  ex.textContent = '⤓ Export (' + selSet.size + ') ▾';
  b.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" style="vertical-align:-1px;margin-right:5px"><path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 9.5h6.4L12 4M6.5 7v4M9.5 7v4"/></svg>Delete (' + selSet.size + ')';
  window.dispatchEvent(new CustomEvent('atelier-gallery-selection-change'));
}
function toggleSel(rel: string, el: { classList: { remove: (arg0: string) => void; add: (arg0: string) => void; }; textContent: string; }, e: PointerEvent){
  // Shift-click selects every card between the last-clicked one and this one (display order).
  if(e && e.shiftKey && lastSelRel && lastSelRel!==rel){
    const a = renderedRels.indexOf(lastSelRel), b = renderedRels.indexOf(rel);
    if(a>=0 && b>=0){
      const lo = Math.min(a,b), hi = Math.max(a,b);
      const turnOn = !selSet.has(rel);                 // range follows the target's new state
      for(let i=lo;i<=hi;i++){ if(turnOn) selSet.add(renderedRels[i]); else selSet.delete(renderedRels[i]); }
      if(window.getSelection) window.getSelection().removeAllRanges();   // drop the blue text-drag
      updateDelBtn(); render(); return;   // anchor stays at the last plain click, so you can re-adjust the endpoint
    }
  }
  if(selSet.has(rel)){ selSet.delete(rel); el.classList.remove('on'); el.textContent='▢'; }
  else{ selSet.add(rel); el.classList.add('on'); el.textContent='■'; }
  lastSelRel = rel;
  paintSelection();
  updateDelBtn();
}
// --- compare: selected images with synchronized zoom/pan ---
let cmpVert = true, cmpZoom = 1, cmpPanX = 0, cmpPanY = 0, cmpDrag = null;
function cmpApply(){
  document.querySelectorAll<HTMLImageElement>('#cmpInner img').forEach(img=>{
    img.style.transform = `translate(${cmpPanX}px,${cmpPanY}px) scale(${cmpZoom})`;
  });
  (document.getElementById('cmpInfo') as HTMLSpanElement).textContent = Math.round(cmpZoom*100)+'% · wheel zoom · drag pan · Esc close';
}
function cmpReset(){
  cmpZoom = 1; cmpPanX = 0; cmpPanY = 0; cmpApply();
}
function openCompare(){
  const imgs = [...selSet].filter(r => imgExt(r.split('.').pop().toLowerCase()));
  if(imgs.length < 2) return;
  const inner = (document.getElementById('cmpInner') as HTMLDivElement);
  cmpZoom = 1; cmpPanX = 0; cmpPanY = 0;
  inner.className = cmpVert ? '' : 'h';
  inner.innerHTML = imgs.map(rel => {
    const f = FILES.find(x => x.rel === rel);
    const src = rel + (f ? '?v=' + f.mtime : '');
    return `<div class="cmpCell"><span class="clbl">${esc(rel.split('/').pop())}</span><div class="cmpStage"><img src="${escA(src)}" alt=""></div></div>`;
  }).join('');
  (document.getElementById('cmp') as HTMLDivElement).classList.add('show');
  cmpApply();
}
function cmpClose(){ (document.getElementById('cmp') as HTMLDivElement).classList.remove('show'); (document.getElementById('cmpInner') as HTMLDivElement).innerHTML=''; }
(document.getElementById('cmpSel') as HTMLButtonElement).onclick = openCompare;
(document.getElementById('cmpClose') as HTMLSpanElement).onclick = cmpClose;
(document.getElementById('cmpReset') as HTMLButtonElement).onclick = cmpReset;
(document.getElementById('cmpOrient') as HTMLButtonElement).onclick = function(){
  cmpVert = !cmpVert;
  (document.getElementById('cmpInner') as HTMLDivElement).className = cmpVert ? '' : 'h';
  (this as HTMLButtonElement).textContent = cmpVert ? 'Layout: stacked' : 'Layout: side-by-side';
};
const cmpInnerEl = (document.getElementById('cmpInner') as HTMLDivElement);
cmpInnerEl.addEventListener('wheel', e=>{
  if(!(document.getElementById('cmp') as HTMLDivElement).classList.contains('show')) return;
  e.preventDefault();
  const old = cmpZoom;
  cmpZoom = Math.max(.35, Math.min(8, cmpZoom * Math.pow(1.12, -e.deltaY/80)));
  const r = cmpInnerEl.getBoundingClientRect();
  const x = e.clientX - r.left - r.width/2, y = e.clientY - r.top - r.height/2;
  cmpPanX = x - (x - cmpPanX) * (cmpZoom / old);
  cmpPanY = y - (y - cmpPanY) * (cmpZoom / old);
  cmpApply();
},{passive:false});
cmpInnerEl.addEventListener('pointerdown', e=>{
  if(!(document.getElementById('cmp') as HTMLDivElement).classList.contains('show')) return;
  cmpDrag = {x:e.clientX,y:e.clientY,px:cmpPanX,py:cmpPanY};
  cmpInnerEl.querySelectorAll<HTMLDivElement>('.cmpStage').forEach(x=>x.classList.add('drag'));
  cmpInnerEl.setPointerCapture(e.pointerId);
});
cmpInnerEl.addEventListener('pointermove', e=>{
  if(!cmpDrag) return;
  cmpPanX = cmpDrag.px + e.clientX - cmpDrag.x;
  cmpPanY = cmpDrag.py + e.clientY - cmpDrag.y;
  cmpApply();
});
cmpInnerEl.addEventListener('pointerup', e=>{
  cmpDrag = null;
  cmpInnerEl.querySelectorAll<HTMLDivElement>('.cmpStage').forEach(x=>x.classList.remove('drag'));
  try{cmpInnerEl.releasePointerCapture(e.pointerId);}catch(_){}
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && (document.getElementById('cmp') as HTMLDivElement).classList.contains('show')) cmpClose();
  if(e.key === '0' && (document.getElementById('cmp') as HTMLDivElement).classList.contains('show')) cmpReset();
});
function confirmDialog(msg: string, okLabel?: string){
  if(typeof window.__galleryConfirm==='function') return window.__galleryConfirm(msg, okLabel);
  return new Promise(resolve => {
    const m = (document.getElementById('confirmModal') as HTMLDivElement);
    (document.getElementById('confirmMsg') as HTMLDivElement).textContent = msg;
    const ok = (document.getElementById('confirmOk') as HTMLButtonElement), cancel = (document.getElementById('confirmCancel') as HTMLButtonElement);
    ok.textContent = okLabel || 'Delete';
    m.classList.add('show'); m.dataset.open=''; delete m.dataset.closed;
    function onKey(ev: { key: string; stopPropagation: () => void; }){ if(ev.key==='Escape'){ev.stopPropagation();done(false);} else if(ev.key==='Enter'){ev.stopPropagation();done(true);} }
    function done(v: unknown){ m.classList.remove('show'); m.dataset.closed=''; delete m.dataset.open; ok.onclick = cancel.onclick = m.onclick = null; document.removeEventListener('keydown', onKey, true); resolve(v); }
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    m.onclick = e => { if((e.target as HTMLElement).id === 'confirmModal') done(false); };
    document.addEventListener('keydown', onKey, true);
  });
}
function clearSel(){ selSet.clear(); updateDelBtn(); render(); }
(document.getElementById('clrSel') as HTMLButtonElement).onclick = clearSel;
(document.getElementById('hideSel') as HTMLButtonElement).onclick = function(){
  if(!selSet.size) return;
  selSet.forEach(rel=>hidden.add(rel));
  selSet.clear();
  saveHidden(); updateHideChip(); updateDelBtn(); render();
};
// ============ collections, smart-hide rules, export, figure -> script ============
const allCollections = ()=>Object.keys(collections).sort((a,b)=>a.localeCompare(b));
function cleanCollection(){
  const known = new Set(FILES.map(f=>f.rel));
  for(const name of Object.keys(collections)){
    collections[name] = [...new Set((collections[name]||[]).filter((r)=>known.has(r)))].sort();
  }
}
function saveCollections(){ cleanCollection(); localStorage.setItem('figCollections', JSON.stringify(collections)); pushState(); }
function applyCollectionToSel(name: string){
  name=(name||'').trim(); if(!name) return;
  const cur = new Set(collections[name]||[]);
  selSet.forEach(rel=>cur.add(rel));
  collections[name]=[...cur].sort();
  saveCollections(); buildCollectionChip(); render();
}
function removeCollection(name: string){
  delete collections[name];
  if(activeCollection===name) activeCollection='';
  saveCollections(); buildCollectionChip(); render();
}
function setActiveCollection(name: string){
  activeCollection = activeCollection===name ? '' : name;
  buildCollectionChip(); render();
}
function buildCollectionChip(){
  cleanCollection();
  const chip=(document.getElementById('collChip') as HTMLSpanElement), menu=(document.getElementById('collMenu') as HTMLDivElement);
  if(!chip||!menu) return;
  const names=allCollections();
  chip.classList.toggle('on', !!activeCollection);
  chip.innerHTML=(activeCollection?('Collection: '+esc(activeCollection)):'Collections')+' ▾';
  let h = activeCollection ? '<div class="mi clr" data-clear="1">Clear filter</div>' : '';
  h += names.length ? names.map(name=>{
    const n=(collections[name]||[]).length;
    return `<div class="mi${name===activeCollection?' on':''}"><span class="lbl" data-pick="${escA(name)}">${esc(name)} <span class="ct">${n}</span></span><span class="x" data-del="${escA(name)}" title="Delete collection">×</span></div>`;
  }).join('') : '<div class="mi muted">No collections yet — select files, then Collect.</div>';
  h += '<div class="madd"><input type="text" id="collQuick" placeholder="new collection"><button id="collQuickAdd">Add selected</button></div>';
  menu.innerHTML=h;
  menu.onclick=e=>e.stopPropagation();
  menu.querySelectorAll<HTMLElement>('[data-pick]').forEach(el=>el.onclick=()=>{ setActiveCollection(el.dataset.pick); menu.style.display='none'; });
  menu.querySelectorAll<HTMLElement>('[data-del]').forEach(el=>el.onclick=()=>removeCollection(el.dataset.del));
  const c=menu.querySelector<HTMLElement>('[data-clear]'); if(c) c.onclick=()=>{ activeCollection=''; buildCollectionChip(); render(); menu.style.display='none'; };
  const inp=menu.querySelector<HTMLInputElement>('#collQuick'), btn=menu.querySelector<HTMLButtonElement>('#collQuickAdd');
  if(btn) btn.onclick=()=>{ applyCollectionToSel(inp.value); inp.value=''; buildCollectionChip(); };
  if(inp) inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyCollectionToSel(inp.value); inp.value=''; buildCollectionChip(); } };
}
// --- recents : dernières figures ouvertes (cache local pur, jamais sur le serveur)
let recents = JSON.parse(localStorage.getItem('figRecent')||'[]');   // [rel, ...] plus récent d'abord
function markRecent(rel){
  recents = [rel, ...recents.filter((r)=>r!==rel)].slice(0,15);
  try{ localStorage.setItem('figRecent', JSON.stringify(recents)); }catch(e){}
}
function buildRecentChip(){
  const chip=(document.getElementById('recChip') as HTMLSpanElement), menu=(document.getElementById('recMenu') as HTMLDivElement);
  if(!chip||!menu) return;
  const known=new Set(FILES.map(f=>f.rel));
  const list=recents.filter((r)=>known.has(r)).slice(0,10);
  let h = list.length ? list.map((rel)=>{
    const f=FILES.find(x=>x.rel===rel);
    return `<div class="mi"><span class="lbl" data-rec="${escA(rel)}">${esc(truncMid(f.name,38))}</span></div>`;
  }).join('') : '<div class="mi muted">No recently opened figures.</div>';
  if(list.length) h += '<div class="mi clr" data-recclear="1">Clear recents</div>';
  menu.innerHTML=h;
  menu.onclick=e=>e.stopPropagation();
  menu.querySelectorAll<HTMLElement>('[data-rec]').forEach(el=>el.onclick=()=>{ menu.style.display='none'; lbOpenAny(el.dataset.rec); });
  const c=menu.querySelector<HTMLElement>('[data-recclear]');
  if(c) c.onclick=()=>{ recents=[]; try{ localStorage.setItem('figRecent','[]'); }catch(e){} buildRecentChip(); menu.style.display='none'; };
}
function buildWorkflowChip(){
  const chip=(document.getElementById('wfChip') as HTMLSpanElement), menu=(document.getElementById('wfMenu') as HTMLDivElement);
  if(!chip||!menu) return;
  const counts={};
  for(const v of Object.values(workflow)) counts[v]=(counts[v]||0)+1;
  const cur = WORKFLOW_STATUSES.find(([v])=>v===activeWorkflow);
  chip.classList.toggle('on', !!activeWorkflow);
  chip.innerHTML=(cur?('Status: '+esc(cur[1])):'Status')+' ▾';
  let h=`<div class="mi${!activeWorkflow?' on':''}" data-wfpick="">All <span class="ct">${FILES.length}</span></div>`;
  h+=WORKFLOW_STATUSES.map(([v,l])=>
    `<div class="mi${v===activeWorkflow?' on':''}" data-wfpick="${escA(v)}">${esc(l)} <span class="ct">${counts[v]||0}</span></div>`).join('');
  menu.innerHTML=h;
  menu.onclick=e=>e.stopPropagation();
  menu.querySelectorAll<HTMLElement>('[data-wfpick]').forEach(el=>el.onclick=()=>{
    const v=el.dataset.wfpick;
    activeWorkflow = (v && activeWorkflow!==v) ? v : '';
    buildWorkflowChip(); render(); menu.style.display='none';
  });
}
let healthStatus: { ok: boolean; project: string; } = null;
function healthRows(data){
  const ok=data&&data.ok;
  const project=data&&data.project?data.project:'checking...';
  return '<div class="mhd sep">Server health</div>'+
    `<div class="mi"><span class="lbl">Status</span><span class="ct">${ok?'OK':(data?'Offline':'Checking')}</span></div>`+
    `<div class="mi"><span class="lbl">Project</span><span class="ct">${esc(project)}</span></div>`+
    `<div class="mi"><span class="lbl">Mode</span><span class="ct">${lbOrcaFsExitAllowed()?'Orca native viewer':'Browser fullscreen'}</span></div>`+
    '<div class="madd"><button id="healthRefresh">Refresh</button></div>';
}
function checkHealth(){
  healthStatus = null;
  buildViewMenu();
  fetch('/ping').then(r=>r.json()).then(j=>{ healthStatus=j; buildViewMenu(); })
    .catch(()=>{ healthStatus={ok:false,project:''}; buildViewMenu(); });
}
function updateViewChip(){
  const c=(document.getElementById('viewChip') as HTMLSpanElement); if(!c) return;
  c.classList.toggle('on', !showArch || showHidden || hideRules.length>0);  // a non-default view is active
}
function buildViewMenu(){
  const menu=(document.getElementById('viewMenu') as HTMLDivElement); if(!menu) return;
  updateViewChip();
  menu.innerHTML=
    // Embarquée : le thème vient de l'app (postMessage atelier-theme) — proposer
    // le catalogue local désynchroniserait la galerie au premier clic.
    (EMB?'':(
    '<div class="mhd">Theme</div>'+
    Object.keys(THEMES).map(n=>`<div class="mi trow" data-theme="${n}"><span class="lbl">${n}</span>${n===theme?'<span class="tck">✓</span>':''}</div>`).join('')
    ))+
    '<div class="mhd sep">View</div>'+
    `<div class="mi"><label class="lbl"><input type="checkbox" id="vArch" ${showArch?'checked':''}> Include archives</label></div>`+
    `<div class="mi"><label class="lbl"><input type="checkbox" id="vHidden" ${showHidden?'checked':''}> Show hidden${hidden.size?(' ('+hidden.size+')'):''}</label></div>`+
    '<div class="mhd sep">Auto-hide rules (glob)</div>'+
    (hideRules.length?hideRules.map((g)=>`<div class="mi"><span class="lbl mono">${esc(g)}</span><span class="x" data-rm="${escA(g)}" title="Remove rule">×</span></div>`).join(''):'<div class="mi muted">No rules.</div>')+
    '<div class="madd"><input type="text" id="ruleInput" placeholder="e.g. **/_qa/** or *_preview.png"><button id="ruleAdd">Add</button></div>'+
    healthRows(healthStatus);
  menu.onclick=e=>e.stopPropagation();
  menu.querySelectorAll<HTMLElement>('[data-theme]').forEach(el=>el.onclick=()=>{ applyTheme(el.dataset.theme); buildViewMenu(); });
  menu.querySelector<HTMLInputElement>('#vArch').onchange=function(){ showArch=(this as HTMLInputElement).checked; updateViewChip(); render(); };
  menu.querySelector<HTMLInputElement>('#vHidden').onchange=function(){ showHidden=(this as HTMLInputElement).checked; updateViewChip(); render(); };
  menu.querySelectorAll<HTMLElement>('[data-rm]').forEach(el=>el.onclick=()=>{ hideRules=hideRules.filter((x)=>x!==el.dataset.rm); saveRules(); buildViewMenu(); render(); });
  const inp=menu.querySelector<HTMLInputElement>('#ruleInput'), add=menu.querySelector<HTMLButtonElement>('#ruleAdd');
  const doAdd=()=>{ const v=(inp.value||'').trim(); if(v && !hideRules.includes(v)){ hideRules.push(v); saveRules(); buildViewMenu(); render(); const ni=menu.querySelector<HTMLInputElement>('#ruleInput'); if(ni) ni.focus(); } };
  add.onclick=doAdd; inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } };
  const hb=menu.querySelector<HTMLButtonElement>('#healthRefresh'); if(hb)hb.onclick=()=>checkHealth();
}
function buildExportMenu(){
  const menu=(document.getElementById('exportMenu') as HTMLDivElement);
  menu.innerHTML=[['folder','📁 Folder (copy)'],['zip','📦 Zip'],['contact','📄 Contact sheet (print → PDF)']]
    .map(([m,l])=>`<div class="mi"><span class="lbl" data-exp="${m}">${l}</span></div>`).join('');
  menu.onclick=e=>e.stopPropagation();
  menu.querySelectorAll<HTMLElement>('[data-exp]').forEach(el=>el.onclick=()=>{ menu.style.display='none'; doExport(el.dataset.exp); });
}
function doExport(mode){
  if(!selSet.size) return;
  const ex=(document.getElementById('exportSel') as HTMLButtonElement); ex.textContent='Exporting…';
  fetch('/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,rels:[...selSet]})})
    .then(r=>r.json()).then(j=>{ ex.textContent = j&&j.ok ? ('✓ '+j.count+' → '+j.path) : ('✗ '+((j&&j.error)||'error')); setTimeout(updateDelBtn,3000); })
    .catch(()=>{ ex.textContent='✗ server off'; setTimeout(updateDelBtn,3000); });
}
function closeFloat(){ const f=document.getElementById('floatMenu'); if(f){if(f.__trigger)f.__trigger.setAttribute('aria-expanded','false');f.remove();} }
function collectSelMenu(anchor: EventTarget){
  closeFloat();
  const m=document.createElement('div'); m.className='menu'; m.id='floatMenu';
  const names=allCollections();
  m.innerHTML='<div class="mhd">Collect '+selSet.size+' file(s)</div>'+
    names.map(n=>`<div class="mi"><span class="lbl" data-collect="${escA(n)}">${esc(n)} <span class="ct">${(collections[n]||[]).length}</span></span></div>`).join('')+
    '<div class="madd"><input type="text" id="collInput" placeholder="new collection"><button id="collApply">Add</button></div>';
  m.onclick=e=>e.stopPropagation();
  placeMenu(m, anchor);
  m.querySelectorAll<HTMLElement>('[data-collect]').forEach(el=>el.onclick=()=>{ applyCollectionToSel(el.dataset.collect); closeFloat(); });
  const inp=m.querySelector<HTMLInputElement>('#collInput'), btn=m.querySelector<HTMLButtonElement>('#collApply');
  const go=()=>{ applyCollectionToSel(inp.value); closeFloat(); };
  btn.onclick=go; inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } };
  inp.focus();
}
function cardMenu(anchor, rel: string){
  closeFloat();
  const f=FILES.find(x=>x.rel===rel); if(!f) return;
  const isHid=hidden.has(rel);
  const m=document.createElement('div'); m.className='menu'; m.id='floatMenu';
  const curWf = workflow[rel]||'';
  m.innerHTML='<div class="mhd">'+esc(f.name)+'</div>'
    +'<div class="mi"><button class="lbl" data-cact="open">Ouvrir'+(EMB?' dans Atelier':' avec l’application par défaut')+'</button></div>'
    +'<div class="mi"><button class="lbl" data-cact="fav">'+(favs.has(rel)?'Retirer des favoris':'Ajouter aux favoris')+'</button></div>'
    +'<div class="mi"><button class="lbl" data-cact="copy">Copier le chemin</button></div>'
    +(EMB?'<div class="mi"><button class="lbl" data-cact="chat">Joindre au chat</button></div>':'')
    +'<div class="mi" style="cursor:default">'+rateRow(rel)+'</div>'
    +'<div class="mhd sep">Status</div>'
    +[['','None']].concat(WORKFLOW_STATUSES).map(([v,l])=>
      `<div class="mi${curWf===v?' on':''}"><span class="lbl" data-wfset="${escA(v)}">${curWf===v?'✓ ':''}${esc(l)}</span></div>`).join('')
    +'<div class="mhd sep"></div>'
    +'<div class="mi"><span class="lbl" data-cact="src">Open script &lt;/&gt;</span></div>'
    +'<div class="mi"><span class="lbl" data-cact="board">Send to whiteboard</span></div>'
    +'<div class="mi"><span class="lbl" data-cact="hide">'+(isHid?'Unhide':'Hide')+'</span></div>'
    +'<div class="mi clr"><span class="lbl" data-cact="del">Move to Trash</span></div>';
  m.addEventListener('click',e=>e.stopPropagation());
  placeMenu(m, anchor);
  m.querySelector<HTMLElement>('[data-cact="open"]').onclick=()=>{closeFloat();openInContext(rel);};
  m.querySelector<HTMLElement>('[data-cact="fav"]').onclick=()=>{closeFloat();toggleFav(rel,anchor);};
  m.querySelector<HTMLElement>('[data-cact="copy"]').onclick=async()=>{try{await navigator.clipboard.writeText(rel);closeFloat();}catch{m.querySelector<HTMLElement>('[data-cact="copy"]').textContent='Copie impossible';}};
  const chatAction=m.querySelector<HTMLElement>('[data-cact="chat"]');
  if(chatAction)chatAction.onclick=()=>{if((chatAction as HTMLInputElement).disabled)return;(chatAction as HTMLInputElement).disabled=true;chatAction.textContent='Envoi…';postChatAttachment(rel).then(()=>{chatAction.textContent='Ajouté au chat';}).catch(()=>{(chatAction as HTMLInputElement).disabled=false;chatAction.textContent='Réessayer l’ajout au chat';});};
  m.querySelectorAll<HTMLElement>('[data-wfset]').forEach(sp=>{ sp.onclick=()=>{ closeFloat(); setWorkflow(rel, sp.dataset.wfset); }; });
  m.querySelectorAll<HTMLElement>('[data-act="rate"]').forEach(sp=>{ sp.onclick=(ev)=>{ setRate(rel, +sp.dataset.n, ev); closeFloat(); }; });
  const _src=m.querySelector<HTMLElement>('[data-cact="src"]'); if(_src) _src.onclick=()=>{ closeFloat(); findScript(rel); };
  const _bd=m.querySelector<HTMLElement>('[data-cact="board"]'); if(_bd) _bd.onclick=()=>{ closeFloat(); sendToBoard(rel, anchor); };
  m.querySelector<HTMLElement>('[data-cact="hide"]').onclick=()=>{ closeFloat(); toggleHide(rel); };
  m.querySelector<HTMLElement>('[data-cact="del"]').onclick=()=>{ closeFloat(); delOne(rel); };
}
function placeMenu(menu: HTMLElement, anchor){
  // append to <body> to escape the sticky header's backdrop-filter containing block,
  // then position fixed and clamp inside the viewport so it never clips off-screen.
  if(menu.parentNode!==document.body) document.body.appendChild(menu);
  menu.dataset.slot='dropdown-menu-content'; menu.dataset.open=''; delete menu.dataset.closed;
  menu.setAttribute('role','menu'); menu.__trigger=anchor;
  if(anchor){anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','true');if(menu.id)anchor.setAttribute('aria-controls',menu.id);}
  menu.style.display='flex';
  const r=anchor.getBoundingClientRect(), vw=document.documentElement.clientWidth;
  let left=Math.min(r.left, vw-menu.offsetWidth-8); left=Math.max(8,left);
  menu.style.maxHeight='calc(100vh - 16px)';menu.style.overflowY='auto';
  menu.style.left=left+'px'; menu.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-menu.offsetHeight-8))+'px';
}
function menuToggle(menu: HTMLElement, anchor: EventTarget){
  const open = menu.style.display==='flex';
  // un sous-menu ouvert DEPUIS le popover Filters ne doit pas le fermer
  const insideFilters = !!(anchor && (anchor as Element).closest && (anchor as Element).closest<HTMLDivElement>('#filtersMenu'));
  document.querySelectorAll<HTMLDivElement>('.menu').forEach(x=>{
    if(insideFilters && x.id==='filtersMenu') return;
    x.style.display='none'; x.dataset.closed=''; delete x.dataset.open;
    if(x.__trigger)x.__trigger.setAttribute('aria-expanded','false');
  });
  closeFloat();
  if(open) return;
  placeMenu(menu, anchor);
}
function lbOpenAny(rel: unknown){
  const f=FILES.find(x=>x.rel===rel); if(!f) return false;
  const i=lbList.findIndex(x=>x.rel===rel);
  if(i>=0) lbShow(i);
  else {
    // Le fichier visé est HORS de la vue courante (un `.py` ouvert depuis la
    // provenance ou l'inspecteur, alors que la grille filtre des figures) :
    // la liste d'un seul élément est TEMPORAIRE. Sans mise de côté, elle
    // restait la liste de la galerie jusqu'au prochain `render()` — et plus
    // aucune vignette ne s'ouvrait, `lbOpen` cherchant dans un tableau d'un
    // élément (bug vécu 2026-08-28 : « je clique sur la figure, rien »).
    if(lbListSaved===null) lbListSaved=lbList;
    lbList=[f]; lbShow(0);
  }
  return true;
}
/** Remet la liste de la galerie en place après une ouverture hors vue. */
function lbListRestore(){
  if(lbListSaved!==null){ lbList=lbListSaved; lbListSaved=null; }
}
function findScript(rel: string){
  const stem = rel.split('/').pop().replace(/\.[^.]+$/,'');
  const hit = FILES.find(f=>codeExt(f.ext) && f.rel.split('/').pop().replace(/\.[^.]+$/,'')===stem);
  if(hit){ lbOpenAny(hit.rel); return; }
  fetch('/findscript?stem='+encodeURIComponent(stem)).then(r=>r.json()).then(j=>{
    if(j && j.script){ if(!lbOpenAny(j.script)) window.open('/'+j.script.split('/').map(encodeURIComponent).join('/'),'_blank'); }
    else alert('No generating script found for "'+stem+'".');
  }).catch(()=>alert('Script search failed (server off?).'));
}
function sendToBoard(rel: string, el){
  fetch('/board/command',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({type:'add_image', url:'/'+rel})})
    .then(r=>r.json()).then(j=>{
      hovFlash(el, j.ok?'ok':'ko', 1200);
    }).catch(()=>{ hovFlash(el,'ko',1200); });
}
function toolOpenLightbox(page: string){
  // Open a bundled tool (whiteboard/notes) inside the lightbox iframe (same-page,
  // like every other viewer) — window.open is unreliable inside embedded surfaces.
  const img=(document.getElementById('lbImg') as HTMLImageElement), pdf=(document.getElementById('lbPdf') as HTMLIFrameElement), vid=(document.getElementById('lbVid') as HTMLVideoElement);
  if(vid.getAttribute('src')){vid.pause();vid.removeAttribute('src');vid.load();}
  lbIdx=-1;
  img.style.display='none'; vid.style.display='none'; pdf.style.display='';
  pdf.src='/.fig_thumbs/'+page+'/index.html';
  lb().classList.add('vw'); lb().classList.remove('annot'); lb().classList.add('show');
}
function toolOpenTab(endpoint: string|URL|Request, page: string){
  // New embedded-browser tab via the server (popups are blocked in surfaces);
  // fall back to the in-page lightbox viewer if that fails. Both muxy and orca
  // can run at once — tell the server which app hosts THIS gallery so the tab
  // opens here (?orcaFs=1 is stamped on the URL by the Orca launcher).
  // Atelier Studio : la galerie est en iframe — ouvrir un onglet Studio direct
  if(EMB){
    try{ __atelierPost({type:'atelier-open-tab', url:'/.fig_thumbs/'+page+'/index.html',
      title: page==='whiteboard'?'board':'notes'}); return; }catch(e){}
  }
  const host=new URLSearchParams(location.search).get('orcaFs')==='1'?'orca':'';  // ''=laisser le serveur choisir (cmux d'abord)
  const fb=()=>toolOpenLightbox(page);
  fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({host})}).then(r=>{ if(!r.ok) fb(); }).catch(fb);
}
if(EMB){
  document.documentElement.classList.add('emb');
  const ctr=document.querySelector<HTMLDivElement>('.controls');
  const sp=document.createElement('span'); sp.className='ctrl-sp'; ctr.appendChild(sp);
  // Board/Notes = sélecteur de vue compact dans le header (décision 014) ;
  // le menu Settings de la galerie est atteignable via ⋯ (Gallery settings)
  for(const id of ['boardChip','notesChip']) ctr.appendChild(document.getElementById(id));
  (document.getElementById('viewChip') as HTMLSpanElement).style.display='none';
}
(document.getElementById('boardChip') as HTMLSpanElement).onclick=()=>toolOpenTab('/board/open-surface','whiteboard');
(document.getElementById('notesChip') as HTMLSpanElement).onclick=()=>toolOpenTab('/notes/open-surface','notes');

// ============ plan 019 — barre de commande : popover Filters, chips actives,
// ============ barre de sélection, overflow ⋯ =================================
// Les contrôles historiques (ids, builders, handlers) restent la source de
// vérité : ils sont RELOCALISÉS dans le popover #filtersMenu (groupes), leurs
// sous-menus s'ouvrent par-dessus (menuToggle sait ne pas fermer le popover).
(function(){
  const put=(slotId: string, ...els: Element[])=>{ const s=document.getElementById(slotId); if(!s) return;
    els.forEach(el=>{ if(el) s.appendChild(el); }); };
  const fsel=(document.getElementById('folder') as HTMLSelectElement);
  put('fgFolder', fsel, fsel && fsel.nextElementSibling); // select + bouton custom (.csel-btn)
  put('fgFmt', (document.getElementById('fmtChip') as HTMLSpanElement));
  put('fgFav', (document.getElementById('favChip') as HTMLSpanElement), (document.getElementById('rateFilter') as HTMLSpanElement));
  put('fgColl', (document.getElementById('collChip') as HTMLSpanElement));
  put('fgWf', (document.getElementById('wfChip') as HTMLSpanElement));
  put('fgRec', (document.getElementById('recChip') as HTMLSpanElement));
  const fm=(document.getElementById('filtersMenu') as HTMLDivElement);
  fm.addEventListener('click',e=>e.stopPropagation());
  (document.getElementById('filtersChip') as HTMLSpanElement).onclick=e=>{
    e.stopPropagation();
    menuToggle(fm, e.currentTarget);
  };
  (document.getElementById('filtersClear') as HTMLButtonElement).onclick=()=>{ clearAllFilters(); };
})();

/* filtres actifs → compteur du bouton Filters + chips supprimables */
function fmtIsFiltered(){ return formatFilterExplicit; }
function clearFilter(k: string){
  if(k==='folder'){ fsel.value=''; render(); const b=fsel.nextElementSibling; if(b&&b.classList.contains('csel-btn')) b.textContent=fsel.options[0].text; }
  else if(k==='fmt'){ Object.assign(exts, DEFAULT_EXTS); setFormatFilterExplicit(false); saveExts(); buildFmtMenu(); fmtChipLabel(); render(); }
  else if(k==='fav'){ if(onlyFavs) favChip.onclick(undefined); }
  else if(k==='coll'){ activeCollection=''; buildCollectionChip(); render(); }
  else if(k==='wf'){ activeWorkflow=''; buildWorkflowChip(); render(); }
  else if(k==='chat'){ chatFocusRels.clear(); render(); }
}
function clearAllFilters(){ ['folder','fmt','fav','coll','wf','chat'].forEach(clearFilter); }
function renderActiveChips(){
  const box=(document.getElementById('activeChips') as HTMLDivElement); if(!box) return;
  const chips=[];
  if(fsel.value) chips.push({k:'folder',l:'Folder: '+fsel.value});
  if(fmtIsFiltered()){
    const on=FMT_CATS.filter(([,ks])=>ks.some((x)=>exts[x])).map(([lab])=>lab);
    chips.push({k:'fmt',l:'Formats: '+(on.length?on.join(', '):'none')});
  }
  if(onlyFavs) chips.push({k:'fav',l:'★ Favorites'+(rateMin?(' · '+rateMin+'★'):'')});
  if(activeCollection) chips.push({k:'coll',l:'Collection: '+activeCollection});
  if(activeWorkflow){
    const cur=WORKFLOW_STATUSES.find(([v])=>v===activeWorkflow);
    chips.push({k:'wf',l:'Status: '+(cur?cur[1]:activeWorkflow)});
  }
  if(chatFocusRels.size) chips.push({k:'chat',l:'Chat focus: '+chatFocusRels.size});
  box.innerHTML = chips.length
    ? chips.map(c=>`<span class="fchip">${esc(c.l)}<span class="x" role="button" tabindex="0" data-fx="${c.k}" title="Remove this filter" aria-label="Remove filter ${escA(c.l)}">×</span></span>`).join('')
      + '<span class="fchip fclear" id="fclearAll" role="button" tabindex="0">Clear all</span>'
    : '';
  box.querySelectorAll<HTMLElement>('[data-fx]').forEach(x=>{
    const go=()=>clearFilter(x.dataset.fx);
    x.onclick=go; x.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();go();} };
  });
  const ca=box.querySelector<HTMLSpanElement>('#fclearAll');
  if(ca){ ca.onclick=clearAllFilters; ca.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();clearAllFilters();} }; }
  const fc=(document.getElementById('filtersChip') as HTMLSpanElement);
  if(fc){ fc.classList.toggle('on',chips.length>0); fc.innerHTML='Filters'+(chips.length?(' ('+chips.length+')'):'')+' &#9662;'; }
}

/* overflow ⋯ de surface : Rescan (état visible), Gallery settings, Clear
   annotation (si en attente), Board/Notes en fenêtre étroite */
let quotePending=false;
function buildSurfMenu(){
  const m=(document.getElementById('surfMenu') as HTMLDivElement); if(!m) return;
  const scanning=(document.getElementById('rescan') as HTMLButtonElement).classList.contains('spinning');
  m.innerHTML=
    `<div class="mi" data-sm="rescan"><span class="lbl">Rescan</span><span class="ct">${scanning?'scanning…':''}</span></div>`+
    '<div class="mi" data-sm="settings"><span class="lbl">Gallery settings…</span></div>'+
    (quotePending?'<div class="mi" data-sm="quote"><span class="lbl">Clear annotation</span></div>':'')+
    '<div class="mi narrow-only" data-sm="board"><span class="lbl">Board</span></div>'+
    '<div class="mi narrow-only" data-sm="notes"><span class="lbl">Notes</span></div>';
  m.onclick=e=>e.stopPropagation();
  m.querySelector<HTMLElement>('[data-sm="rescan"]').onclick=()=>{ (document.getElementById('rescan') as HTMLButtonElement).onclick.call((document.getElementById('rescan') as HTMLButtonElement)); buildSurfMenu(); };
  m.querySelector<HTMLElement>('[data-sm="settings"]').onclick=()=>{ buildViewMenu(); menuToggle((document.getElementById('viewMenu') as HTMLDivElement), (document.getElementById('surfMore') as HTMLButtonElement)); };
  const q=m.querySelector<HTMLElement>('[data-sm="quote"]'); if(q) q.onclick=()=>{ (document.getElementById('quoteClear') as HTMLButtonElement).onclick(undefined); m.style.display='none'; };
  m.querySelector<HTMLElement>('[data-sm="board"]').onclick=()=>{ m.style.display='none'; toolOpenTab('/board/open-surface','whiteboard'); };
  m.querySelector<HTMLElement>('[data-sm="notes"]').onclick=()=>{ m.style.display='none'; toolOpenTab('/notes/open-surface','notes'); };
}
(document.getElementById('surfMore') as HTMLButtonElement).onclick=e=>{ e.stopPropagation(); buildSurfMenu(); menuToggle((document.getElementById('surfMenu') as HTMLDivElement), e.currentTarget); };

// ============ sélection clavier + viewer direct =============================
// Un clic sur une figure ouvre le viewer. La sélection interne reste disponible
// pour la navigation clavier; les métadonnées et actions vivent sur la carte et
// dans son menu ⋯, sans réduire la galerie avec un panneau latéral.
let selectedRel=null, inspFindSeq=0, inspAddState='idle', inspAddTimer: ReturnType<typeof setTimeout> | number=0;
function paintSelection(){
  document.querySelectorAll<HTMLDivElement>('#grid .card[data-card]').forEach(c=>{
    const on=c.dataset.card===selectedRel;
    c.classList.toggle('bulk-selected',selSet.has(c.dataset.card));
    c.classList.toggle('sel2',on);
    c.setAttribute('aria-selected',(on||selSet.has(c.dataset.card))?'true':'false');
  });
}
function selectCard(rel){
  if(selectedRel!==rel){ inspAddState='idle'; }
  selectedRel=rel;
  document.body.classList.remove('has-insp');
  paintSelection();
}
function closeInspector(focusBack?: boolean){
  if(!selectedRel && !document.body.classList.contains('has-insp')) return;
  selectedRel=null; inspAddState='idle';
  document.body.classList.remove('has-insp');
  paintSelection();
  if(focusBack!==false) (document.getElementById('grid') as HTMLElement).focus();
}
(document.getElementById('inspClose') as HTMLButtonElement).onclick=()=>closeInspector();
(document.getElementById('inspScrim') as HTMLDivElement).onclick=()=>closeInspector();
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if(lb().classList.contains('show')) return;                          // lightbox d'abord
  if((document.getElementById('cmp') as HTMLDivElement).classList.contains('show')) return; // compare d'abord
  const openMenus=[...document.querySelectorAll<HTMLDivElement>('.menu')].filter(m=>m.style.display==='flex');
  if(openMenus.length){ openMenus.forEach(m=>m.style.display='none'); closeFloat(); return; }
  if(document.body.classList.contains('has-insp')) closeInspector();
});
function inspRow(l: string,v: string,title?: string){
  return '<div class="irow">'+(l?('<span class="il">'+esc(l)+'</span>'):'')
    +'<span class="iv"'+(title?(' title="'+escA(title)+'"'):'')+'>'+v+'</span></div>';
}
function updateInspector(){
  const rel=selectedRel; if(!rel) return;
  const f=FILES.find(x=>x.rel===rel);
  const body=(document.getElementById('inspBody') as HTMLDivElement), ttl=(document.getElementById('inspTitle') as HTMLSpanElement);
  if(!f){
    ttl.textContent=rel.split('/').pop();
    body.innerHTML='<div id="inspNotice" class="show">File no longer in the index (deleted or removed by a rescan).</div>';
    return;
  }
  ttl.textContent=f.name; ttl.title=f.rel;
  const isImg=imgExt(f.ext), isHtml=f.ext==='html'||f.ext==='htm';
  // L'inspecteur doit revalider la source à chaque ouverture. Sans ce nonce,
  // le navigateur peut réutiliser la vignette de la grille après une
  // suppression externe et masquer à tort l'erreur de fichier manquant.
  // Cache-bust au mtime (f.mtime change quand la figure change), pas à chaque render (Date.now()).
  // La fenêtre de revalidation reste donc bornée par l'intervalle de rescan (mtime rafraîchi à ce moment-là).
  const tsrc=(isImg||isHtml)?('/thumb?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&w=480&v='+f.mtime+'&inspect='+(f.mtime||0)):(f.thumb||null);
  const wf=workflow[f.rel]||'';
  const colls=allCollections();
  body.innerHTML=
    '<div class="isec"><div id="inspPrev"'+(tsrc?'':' class="ph2"')+'>'+
      (tsrc?('<img alt="" src="'+escA(tsrc)+'">'):esc(f.ext.toUpperCase()))+'</div></div>'
    +'<div class="isec"><h3>Identity</h3>'
      +inspRow('Type', esc(f.ext.toUpperCase())+(f.code?' · script':''))
      +inspRow('Path', esc(f.rel), f.rel)
      +inspRow('Size', esc(fmtSize(f.size)))
      +inspRow('Modified', esc(f.mdate)+(f.bdate?(' · created '+esc(f.bdate)):''))
    +'</div>'
    +'<div class="isec"><h3>Workflow</h3><div class="iwf">'
      +[['','None']].concat(WORKFLOW_STATUSES).map(([v,l])=>
        '<button data-iwf="'+escA(v)+'" class="'+(wf===v?'on':'')+'" aria-pressed="'+(wf===v)+'">'+esc(l)+'</button>').join('')
    +'</div></div>'
    +'<div class="isec"><h3>Provenance</h3>'
      +inspRow('Project','<span style="font-family:var(--code-font);font-size:11px" title="__ROOT__">'+esc('__ROOT__'.split('/').pop()||'__ROOT__')+'</span>')
      +inspRow('Generating script','<span id="inspScript">'+((isImg||f.ext==='pdf')?'Searching…':'Not recorded')+'</span>')
    +'</div>'
    +'<div class="isec"><h3>Organization</h3>'
      +'<div class="irow"><span class="il">Favorite</span><span class="iv"><button id="inspFav" style="height:24px;font-size:11px">'+(favs.has(rel)?'★ Remove favorite':'☆ Add favorite')+'</button></span></div>'
      +inspRow('Rating', rateRow(rel))
      +(colls.length?('<div class="irow"><span class="il">Collections</span><span class="iv icoll">'
        +colls.map(n=>'<label><input type="checkbox" data-icoll="'+escA(n)+'"'+((collections[n]||[]).includes(rel)?' checked':'')+'> '+esc(n)+'</label>').join('')+'</span></div>'):'')
    +'</div>'
    +'<div class="isec"><h3>Actions</h3><div class="iact">'
      +'<button id="inspView" title="Open in the viewer">View</button>'
      +'<button id="inspOpen" title="'+(EMB?'Open in Atelier IDE':'Open with the default app')+'">'+(EMB?'Open in IDE':'Open (app)')+'</button>'
      +(EMB?('<button id="inspChat">'+(inspAddState==='added'?'Added to chat ✓':inspAddState==='pending'?'Adding…':'Add to chat')+'</button>'):'')
      +'<button id="inspMore" title="More — hide, trash…" aria-label="More actions">⋯</button>'
    +'</div><div id="inspNotice"></div></div>';
  // preview : chargé À la sélection (jamais au hover) ; échec → fallback type
  const pimg=body.querySelector<HTMLImageElement>('#inspPrev img');
  if(pimg){
    const previewFailed=()=>{
      const pv=(document.getElementById('inspPrev') as HTMLDivElement); if(!pv) return;
      pv.classList.add('ph2'); pv.textContent=f.ext.toUpperCase();
      const n=(document.getElementById('inspNotice') as HTMLDivElement);
      if(n){ n.textContent='Preview unavailable (file missing or unreadable).'; n.classList.add('show'); }
    };
    pimg.onerror=previewFailed;
    // innerHTML démarre la requête avant que `onerror` puisse être assigné.
    // Une 404 locale peut donc déjà être terminée : rattraper cet état rend
    // l'inspecteur déterministe sans relancer une seconde requête.
    if(pimg.complete && !pimg.naturalWidth) previewFailed();
  }
  // provenance RÉELLE : script générateur via /findscript, anti-course par séquence
  if(isImg||f.ext==='pdf'){
    const seq=++inspFindSeq, stem=rel.split('/').pop().replace(/\.[^.]+$/,'');
    const put=(txt: string,openRel)=>{
      if(seq!==inspFindSeq) return;
      const s=(document.getElementById('inspScript') as HTMLSpanElement); if(!s) return;
      s.innerHTML=openRel?('<a href="#" data-iscript="'+escA(openRel)+'" style="color:var(--primary)">'+esc(openRel)+'</a>'):esc(txt);
      const a=s.querySelector<HTMLElement>('[data-iscript]');
      if(a) a.onclick=(ev)=>{ ev.preventDefault(); lbOpenAny(a.dataset.iscript); };
    };
    const local=FILES.find(x=>codeExt(x.ext)&&x.rel.split('/').pop().replace(/\.[^.]+$/,'')===stem);
    if(local) put('',local.rel);
    else fetch('/findscript?stem='+encodeURIComponent(stem)).then(r=>r.json())
      .then(j=>put(j&&j.script?'':'Not recorded', j&&j.script?j.script:null))
      .catch(()=>put('Not recorded',null));
  }
  body.querySelectorAll<HTMLElement>('[data-iwf]').forEach(b=>b.onclick=()=>setWorkflow(rel,b.dataset.iwf));
  body.querySelector<HTMLButtonElement>('#inspFav').onclick=()=>{
    if(favs.has(rel)) favs.delete(rel); else favs.add(rel);
    saveFavs(); pushState();
    (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
    render();
  };
  body.querySelectorAll<HTMLElement>('[data-icoll]').forEach(cb=>cb.onchange=()=>{
    const n=cb.dataset.icoll, cur=new Set(collections[n]||[]);
    if((cb as HTMLInputElement).checked) cur.add(rel); else cur.delete(rel);
    collections[n]=[...cur].sort();
    saveCollections(); buildCollectionChip(); render();
  });
  body.querySelector<HTMLButtonElement>('#inspView').onclick=()=>lbOpenAny(rel);
  body.querySelector<HTMLButtonElement>('#inspOpen').onclick=()=>openInContext(rel);
  const ic=body.querySelector<HTMLButtonElement>('#inspChat');
  if(ic) ic.onclick=()=>{
    // pending bloque le double ajout ; le composer déduplique aussi les
    // éventuelles relances par texte (idempotent)
    if(inspAddState!=='idle') return;
    inspAddState='pending'; ic.textContent='Adding…';
    postChatAttachment(rel).then(()=>{
      inspAddState='added'; ic.textContent='Added to chat ✓';
      clearTimeout(inspAddTimer);
      inspAddTimer=setTimeout(()=>{
        inspAddState='idle';
        const b=(document.getElementById('inspChat') as HTMLButtonElement); if(b) b.textContent='Add to chat';
      },1800);
    }).catch(()=>{
      inspAddState='idle'; ic.textContent='Add to chat';
      const n=(document.getElementById('inspNotice') as HTMLDivElement);
      if(n){ n.textContent='Add to chat was not received — try again.'; n.classList.add('show'); }
    });
  };
  body.querySelector<HTMLButtonElement>('#inspMore').onclick=(e)=>{ e.stopPropagation(); cardMenu(e.currentTarget, rel); };
}
// clavier grille : flèches = déplacer la sélection, Enter = ouvrir
(document.getElementById('grid') as HTMLElement).addEventListener('keydown',e=>{
  if((e.target as Element).closest<HTMLButtonElement>('button,input,[data-detail-resize]')) return;
  if(!renderedRels.length) return;
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Enter'].includes(e.key)) return;
  if(e.key==='Enter'){ if(selectedRel) lbOpenAny(selectedRel); e.preventDefault(); return; }
  const i=renderedRels.indexOf(selectedRel);
  const cardMin=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-min'))||185;
  const cols=galleryPresentation.mode==='list'?1:Math.max(1,Math.floor((document.getElementById('grid') as HTMLElement).clientWidth/(cardMin+16)));
  let n=i<0?0:i+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:e.key==='ArrowDown'?cols:-cols);
  n=Math.max(0,Math.min(renderedRels.length-1,n));
  selectCard(renderedRels[n]); e.preventDefault();
  const c=document.querySelector<HTMLDivElement>('#grid .card.sel2'); if(c&&c.scrollIntoView) c.scrollIntoView({block:'nearest'});
});
(document.getElementById('collChip') as HTMLSpanElement).onclick=e=>{ e.stopPropagation(); buildCollectionChip(); menuToggle((document.getElementById('collMenu') as HTMLDivElement), e.currentTarget); };
(document.getElementById('wfChip') as HTMLSpanElement).onclick=e=>{ e.stopPropagation(); buildWorkflowChip(); menuToggle((document.getElementById('wfMenu') as HTMLDivElement), e.currentTarget); };
(document.getElementById('recChip') as HTMLSpanElement).onclick=e=>{ e.stopPropagation(); buildRecentChip(); menuToggle((document.getElementById('recMenu') as HTMLDivElement), e.currentTarget); };
(document.getElementById('viewChip') as HTMLSpanElement).onclick=e=>{ e.stopPropagation(); buildViewMenu(); menuToggle((document.getElementById('viewMenu') as HTMLDivElement), e.currentTarget); };
(document.getElementById('exportSel') as HTMLButtonElement).onclick=e=>{ e.stopPropagation(); buildExportMenu(); menuToggle((document.getElementById('exportMenu') as HTMLDivElement), e.currentTarget); };
(document.getElementById('collectSel') as HTMLButtonElement).onclick=e=>{ e.stopPropagation(); collectSelMenu(e.currentTarget); };
document.addEventListener('click',()=>{ document.querySelectorAll<HTMLDivElement>('.menu').forEach(x=>x.style.display='none'); closeFloat(); });
function openDefault(rel){
  fetch('/open', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({rel})});
}
function openInContext(rel){
  const f=FILES.find(x=>x.rel===rel);
  // Dans Atelier, tous les documents pris en charge restent dans le même
  // espace de travail et s'ouvrent dans un onglet IDE. En mode navigateur
  // autonome, on conserve l'ouverture dans l'application système.
  if(EMB && f && (f.ext==='tex'||f.ext==='md'||f.ext==='pdf'||f.ext==='svg'||f.ext==='csv'||codeExt(f.ext))){
    lbOpenAny(rel);
    return;
  }
  openDefault(rel);
}
async function delOne(rel: string){
  if(!await confirmDialog('Move to Trash? '+rel)) return;
  try{
    const r=await fetch('/delete',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({rels:[rel]})});
    const j=await r.json();
    (j.deleted||[]).forEach((d)=>{ const i=FILES.findIndex(f=>f.rel===d); if(i>=0) FILES.splice(i,1); selSet.delete(d); });
    updateDelBtn(); render();
  }catch(e){ alert('Delete failed — is the server running?'); }
}
let lbList: GalleryRow[] = [], lbIdx = -1;
// Liste de la galerie mise de côté pendant une ouverture hors vue (lbOpenAny).
let lbListSaved: GalleryRow[] | null = null;
const lb=()=>(document.getElementById('lb') as HTMLDivElement);
async function lbShow(i: number){
  if(lbIdx>=0 && i!==lbIdx && !(await annotGuard())) return;
  if(i<0||i>=lbList.length) return;
  lbZoomLevel=1;lbPanX=0;lbPanY=0;(document.getElementById('lbWrap') as HTMLDivElement).style.transform='';
  lbIdx=i; const f=lbList[i]; lb().classList.remove('annot');
  lbVersionsReset(f);
  markRecent(f.rel);
  const isTex=f.ext==='tex', isPdf=f.ext==='pdf', isMd=f.ext==='md', isCode=codeExt(f.ext), isSvg=f.ext==='svg', isVid=videoExt(f.ext), isCsv=f.ext==='csv';
  // Embarqué dans Atelier Studio : les fichiers texte/code s'ouvrent dans un
  // ONGLET Studio (la galerie reste navigable), pas dans la lightbox.
  if(EMB && (isTex||isMd||isCode||isPdf||isSvg||isCsv)){
    // Studio : latex_studio pour tex/code ; éditeur WYSIWYG pour markdown
    let u;
    if(isPdf) u='/.fig_thumbs/pdf_viewer.html?file='+encodeURIComponent(f.rel)+'&v=__VER__';
    else if(isSvg) u='/.fig_thumbs/svg_viewer.html?file='+encodeURIComponent(f.rel)+'&v=__VER__';
    else if(isMd) u='/.fig_thumbs/md_studio.html?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&v=__VER__';
    else u='/.fig_thumbs/latex_studio.html?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&v=__VER__';
    __atelierPost({type:'atelier-open-tab', url:u, title:f.name});
    await lbClose();
    return;
  }
  const img=(document.getElementById('lbImg') as HTMLImageElement), pdf=(document.getElementById('lbPdf') as HTMLIFrameElement), vid=(document.getElementById('lbVid') as HTMLVideoElement);
  const vw=isPdf||isMd||isCode||isSvg;
  (document.getElementById('lbViewport') as HTMLDivElement).style.display=(vw||isVid)?'none':'flex';
  (document.getElementById('lbZoom') as HTMLDivElement).style.display=(vw||isVid)?'none':'';
  img.alt=f.name;
  img.style.display=(vw||isVid)?'none':'';
  pdf.style.display=vw?'':'none';
  vid.style.display=isVid?'':'none';
  if(!isVid && vid.getAttribute('src')){vid.pause();vid.removeAttribute('src');vid.load();}  // stop playback when leaving a video
  lb().classList.toggle('vw', vw);  // full-window editor/viewer
  if(isVid){vid.src=f.rel+'?v='+f.mtime;img.src='';pdf.src='';}
  else if(isTex){pdf.src='/.fig_thumbs/latex_studio.html?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&v=__VER__';img.src='';}
  else if(isPdf){pdf.src='/.fig_thumbs/pdf_viewer.html?file='+encodeURIComponent(f.rel)+'&v=__VER__';img.src='';}
  else if(isMd){pdf.src='/.fig_thumbs/md_viewer.html?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&file='+encodeURIComponent(f.rel)+'&v=__VER__';img.src='';}
  else if(isCode){pdf.src='/.fig_thumbs/code_editor.html?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&v=__VER__';img.src='';}
  else if(isSvg){pdf.src='/.fig_thumbs/svg_viewer.html?file='+encodeURIComponent(f.rel)+'&v=__VER__';img.src='';}
  else{img.src=f.rel+'?v='+f.mtime;pdf.src='';img.onload=()=>{const d=(document.getElementById('lbDims') as HTMLDivElement);if(d&&img.naturalWidth)d.innerHTML=`<b>Image</b><span>${img.naturalWidth} × ${img.naturalHeight} px · ${esc((f.ext||'').toUpperCase())}</span>`;};}
  (document.getElementById('lbCap') as HTMLDivElement).innerHTML=`<b>${esc(f.name)}</b>`;
  lbInfoBtn.title=f.name;
  const infoRows=[['Dossier',f.folder||'—'],['Modifié',f.mdate||'—'],['Taille',f.size?fmtSize(f.size):'—']];
  (document.getElementById('lbInfo') as HTMLDivElement).innerHTML=infoRows.map(([k,v])=>`<div class="lb-row"><b>${esc(k)}</b><span>${esc(String(v))}</span></div>`).join('')+'<div class="lb-row" id="lbDims"></div>';
  lbSheetToggle(false);
  lbNameToast(f.name);
  (document.getElementById('lbOriginal') as HTMLAnchorElement).href=f.rel;
  (document.getElementById('lbMore') as HTMLDetailsElement).open=false;
  document.getElementById('lbPosition').textContent=(i+1)+' / '+lbList.length;
  (document.getElementById('lbAnnot') as HTMLButtonElement).style.display=(imgExt(f.ext)&&!isSvg)?'flex':'none';
  (document.getElementById('lbAdd') as HTMLButtonElement).disabled=!EMB;
  provSync();
  lb().classList.add('show');
  lbViewportRequest(true);
  requestAnimationFrame(lbFitImage);
  if(['png','jpg','jpeg'].includes(f.ext)) void lbVersionsPoll();
}
// ─── Panneau Provenance ───────────────────────────────────────────────────
// Spec docs/superpowers/specs/2026-08-27-provenance-figures-design.md (C + D).
// Le sidecar <figure>.prov.json est lu par le SERVEUR (GET /prov?file=…) : la
// webview ne touche jamais au disque. Les deux actions repassent par le canal
// annotation→agent déjà en place — atelier-add-to-chat quand la galerie est
// embarquée dans Atelier, POST /quote (push vers la session Claude) sinon.
// Le panneau ne s'ouvre JAMAIS de lui-même : ouvrir une figure montre la
// figure, un point c'est tout. L'état a été persisté (`figProvOpen`) — un seul
// clic revenait alors hanter toutes les figures, y compris les centaines qui
// n'ont aucune provenance. Il vit maintenant le temps d'une lightbox, remis à
// zéro par lbClose.
let provRel='', provSeq=0, provState=null, provHistOpen=false, provOpen=false;
try{ localStorage.removeItem('figProvOpen'); }catch(e){}
function provFmtDate(ts: string|number|Date){
  if(!ts) return '';
  const d=new Date(ts);
  if(isNaN(d.getTime())) return String(ts).slice(0,10);
  try{ return d.toLocaleDateString('fr-CA',{day:'numeric',month:'short',year:'numeric'}); }
  catch(e){ return d.toISOString().slice(0,10); }
}
function provHead(pill: string,off?: boolean){
  return '<div class="pvHead"><h3>Provenance</h3><span class="pvPill'+(off?' off':'')+'">'+esc(pill)+'</span></div>';
}
function provFirst(list){ return (Array.isArray(list)?list.filter(Boolean):[])[0]||''; }
function provAbs(){ return '__ROOT__/'+provRel; }
function provSidecar(){ return (provState&&provState.path)||(provAbs()+'.prov.json'); }
function provRenderRich(){
  const e=provState.entry||{}, prov=provState.prov||{}, env=e.env||{};
  const hist=Array.isArray(prov.history)?prov.history:[];
  const script=provFirst(e.scripts), cmd=provFirst(e.commands);
  const meta=[];
  if(env.python) meta.push('py '+env.python);
  if(env.conda) meta.push('conda '+env.conda);
  if(e.head) meta.push(String(e.head).slice(0,7));
  if(e.ts) meta.push(provFmtDate(e.ts));
  let h=provHead('tracée');
  if(script) h+='<div class="pvRow"><span class="pvL">Script</span>'
    +'<button type="button" class="pvLink" data-pvscript="'+escA(script)+'">'+esc(script)+'</button></div>';
  if(cmd) h+='<div class="pvRow"><span class="pvL">Commande</span><div class="pvCmd">'+esc(cmd)+'</div></div>';
  if(e.prompt) h+='<div class="pvRow"><span class="pvL">Contexte</span><div class="pvQuote">'+esc(e.prompt)+'</div></div>';
  if(e.threadTitle) h+='<div class="pvRow"><span class="pvL">Conversation</span><span class="pvV">'+esc(e.threadTitle)+'</span></div>';
  if(meta.length) h+='<div class="pvMeta">'+esc(meta.join(' · '))+'</div>';
  h+='<div class="pvAct"><button type="button" class="pvBtn on" data-pvact="regen">Régénérer</button>'
    +(script?'<button type="button" class="pvBtn" data-pvscript="'+escA(script)+'">Ouvrir le script</button>':'')
    +'</div>';
  if(hist.length>1){
    h+='<button type="button" class="pvHistTog" aria-expanded="'+(provHistOpen?'true':'false')+'">'
      +'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>'
      +esc(hist.length+' générations')+'</button>';
    if(provHistOpen) h+='<div class="pvHistList">'+hist.map((g,i: number)=>{
      const label=String(g.prompt||provFirst(g.commands)||provFirst(g.scripts)||'génération');
      return '<div class="pvGen'+(i===0?' now':'')+'"><span class="pvDot"></span>'
        +'<span class="pvGenD">'+esc(provFmtDate(g.ts))+'</span>'
        +'<span class="pvGenT" title="'+escA(label)+'">'+esc(label)+'</span></div>';
    }).join('')+'</div>';
  }
  return h;
}
function provRenderEmpty(){
  return provHead('aucune',true)
    +'<div class="pvEmpty"><b>Figure antérieure au système</b>'
    +'Aucune exécution d’agent n’a laissé de trace à côté de cette figure.</div>'
    +'<div class="pvAct"><button type="button" class="pvBtn on" data-pvact="rebuild">Reconstruire</button></div>';
}
function provRenderError(){
  return provHead('illisible',true)
    +'<div class="pvEmpty"><b>Provenance illisible</b>'
    +'Le fichier existe mais n’a pas pu être lu. Une reconstruction le réécrira proprement.</div>'
    +'<div class="pvAct"><button type="button" class="pvBtn on" data-pvact="rebuild">Reconstruire</button></div>';
}
function provPaint(){
  const el=(document.getElementById('provBody') as HTMLDivElement); if(!el) return;
  const st=provState;
  el.innerHTML = !st ? ''
    : st.kind==='rich' ? provRenderRich()
    : st.kind==='error' ? provRenderError()
    : st.kind==='empty' ? provRenderEmpty()
    : provHead('…',true)+'<div class="pvNote">Lecture de la provenance…</div>';
  el.querySelectorAll<HTMLElement>('[data-pvscript]').forEach(b=>b.onclick=()=>provOpenScript(b.dataset.pvscript));
  el.querySelectorAll<HTMLElement>('[data-pvact]').forEach(b=>b.onclick=()=>provAction(b.dataset.pvact,b));
  const tog=el.querySelector<HTMLButtonElement>('.pvHistTog');
  if(tog) tog.onclick=()=>{ provHistOpen=!provHistOpen; provPaint(); };
}
function provLoad(rel: string){
  // anti-course par séquence : la navigation ← → enchaîne les figures plus vite
  // que les réponses du serveur (même garde que la recherche de script)
  provRel=rel; provHistOpen=false; provState={kind:'loading'};
  const seq=++provSeq;
  provPaint();
  if(!rel){ provState=null; provPaint(); return; }
  fetch('/prov?file='+encodeURIComponent(rel)).then(async r=>{
    let j=null; try{ j=await r.json(); }catch(_){}
    if(seq!==provSeq) return;
    const entry=(j&&j.prov&&Array.isArray(j.prov.history)?j.prov.history:[])[0]||null;
    if(r.status===404) provState={kind:'empty'};          // pas de sidecar
    else if(!r.ok||!j||!j.ok) provState={kind:'error'};    // 422 : JSON illisible
    else if(!entry) provState={kind:'empty'};              // sidecar valide mais vide
    else provState={kind:'rich',prov:j.prov,path:j.path,entry};
    provPaint();
  }).catch(()=>{ if(seq===provSeq){ provState={kind:'error'}; provPaint(); } });
}
// Rejoué à chaque figure ouverte : le bouton n'existe que pour les images, et
// le panneau ne se charge que s'il est réellement déplié.
function provSync(){
  const f=(lbIdx>=0?lbList[lbIdx]:null)||null;
  const eligible=!!(f&&imgExt(f.ext));
  const btn=(document.getElementById('lbProv') as HTMLButtonElement);
  // valeur EXPLICITE des deux côtés (piège n°13 : ne jamais « remontrer » par '')
  if(btn) btn.style.display=eligible?'flex':'none';
  const on=eligible&&provOpen;
  lb().classList.toggle('prov',on);
  if(btn) btn.setAttribute('aria-pressed',on?'true':'false');
  if(!on) return;
  if(f.rel!==provRel||!provState) provLoad(f.rel);
}
function provToggle(){
  provOpen=!provOpen;
  // Relire à chaque ouverture : un agent vient peut-être d'écrire le sidecar
  // (« Reconstruire »/« Régénérer ») pendant que le panneau était replié. Un
  // état mémoïsé affichait alors « aucune provenance » sur une figure qui en
  // avait une — bug vu le 2026-08-28, juste après une reconstruction réussie.
  if(provOpen){ provState=null; provRel=''; }
  provSync();
}
function provOpenScript(rel: string){
  if(!rel) return;
  // Script présent au catalogue : même chemin que l'inspecteur. Sinon (script
  // hors périmètre de la galerie), ouverture directe de l'éditeur de code.
  if(lbOpenAny(rel)){ if(EMB) lbClose(); return; }
  const u='/.fig_thumbs/code_editor.html?path='+encodeURIComponent('__ROOT__/'+rel)+'&v=__VER__';
  if(EMB){ __atelierPost({type:'atelier-open-tab',url:u,title:rel.split('/').pop()}); lbClose(); }
  else window.open(u,'_blank');
}
function provClaudeTarget(){
  try{ return JSON.parse(localStorage.getItem('claudeTargetV1')||'null'); }catch(e){ return null; }
}
function provAction(kind: string,btn: Element){
  if(!provRel||(btn as HTMLInputElement).disabled) return;
  const abs=provAbs(), name=provRel.split('/').pop();
  // Pas de rejeu aveugle de la commande : l'agent lit la provenance et décide
  // (spec D — comme pour une annotation, c'est lui qui rééedite son script).
  const text = kind==='regen'
    ? abs+'\nProvenance : '+provSidecar()
      +'\nRégénère cette figure : lis d’abord ce prov.json (script générateur, commande et environnement y sont), applique la correction demandée dans le script, puis relance la génération.'
    : abs+'\nAucune provenance enregistrée pour cette figure (pas de '+abs+'.prov.json).'
      +'\nRetrouve le script qui la génère, puis écris à côté d’elle un '+name+'.prov.json rétroactif (format v1, entrée d’historique marquée "reconstructed": true).';
  const label=btn.textContent;
  (btn as HTMLInputElement).disabled=true; btn.textContent='Envoi…';
  const done=(ok)=>{
    btn.textContent=ok?'Envoyé ✓':'Échec';
    setTimeout(()=>{ (btn as HTMLInputElement).disabled=false; btn.textContent=label; },1800);
  };
  if(EMB){
    postChatPayload({text,path:abs,name}).then(()=>done(true)).catch(()=>done(false));
    return;
  }
  fetch('/quote',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rel:provRel,text,direct:true,target:provClaudeTarget()})})
    .then(r=>done(r.ok)).catch(()=>done(false));
}
function lbNav(dir: number){
  // Navigation flèches/chevrons : sauter les types qui ouvrent un viewer iframe
  // pleine fenêtre (mode vw : svg/pdf/md/tex/code) — il masque l'UI et capte
  // souris/clavier, donc impossible d'en ressortir au clavier ou aux chevrons.
  // En plein écran (fs), rester strictement sur les images bitmap.
  const fs=lb().classList.contains('fs');
  const ok=(f)=> fs ? ['png','jpg','jpeg'].includes(f.ext)
               : !(f.ext==='svg'||f.ext==='pdf'||f.ext==='md'||f.ext==='tex'||codeExt(f.ext));
  let i=lbIdx+dir;
  while(i>=0&&i<lbList.length&&!ok(lbList[i])) i+=dir;
  lbShow(i);
}
async function lbClose(){
  if(!(await annotGuard()))return;
  if(lb().classList.contains('fs')||fsActiveEl()) await lbFsLeave();
  const v=(document.getElementById('lbVid') as HTMLVideoElement);if(v){v.pause();v.removeAttribute('src');v.load();}
  lb().classList.remove('show');lb().classList.remove('annot');lb().classList.remove('prov');lbIdx=-1;
  lbVersionsReset(null);
  // provOpen meurt avec la lightbox : la prochaine figure s'ouvre nue.
  provRel='';provState=null;provSeq++;provOpen=false;provHistOpen=false;
  lbListRestore();
  lbHostRequest(false);
  lbViewportRequest(false);
}

// The host owns the window; the same iframe remains alive in its top layer.
let lbZoomLevel=1,lbPanX=0,lbPanY=0;
function lbHostRequest(active: boolean){
  if(window.self!==window.top && new URLSearchParams(location.search).get('embedded')==='atelier')
    window.__atelierPost({type:'atelier-gallery-fullscreen',active});
}
function lbViewportRequest(active: boolean){
  if(window.self!==window.top && new URLSearchParams(location.search).get('embedded')==='atelier')
    window.__atelierPost({type:'atelier-gallery-viewport-request',active});
}
window.addEventListener('message',e=>{
  const d=e.data;
  if(e.source!==window.top||!window.__atelierNonce||d?.nonce!==window.__atelierNonce)return;
  if(d.type==='atelier-gallery-fullscreen-state'&&d.active===false&&lb().classList.contains('fs'))void lbFsLeave();
  if(d.type==='atelier-gallery-viewport'&&['x','y','width','height'].every(k=>Number.isFinite(d[k])&&d[k]>=0)){
    for(const [key,value] of Object.entries({left:d.x,top:d.y,width:d.width,height:d.height}))lb().style.setProperty('--lb-'+key,value+'px');
  }
  requestAnimationFrame(lbFitImage);
});
window.addEventListener('pagehide',()=>{lbHostRequest(false);lbViewportRequest(false);});
function lbFitImage(){
  const stage=(document.getElementById('lbViewport') as HTMLDivElement),img=(document.getElementById('lbImg') as HTMLImageElement),wrap=(document.getElementById('lbWrap') as HTMLDivElement);
  if(!lb().classList.contains('show')||!img.naturalWidth||!stage.clientHeight)return;
  const gap=16; // includes room for a non-overlay scrollbar when returning to fit
  const stageStyle=getComputedStyle(stage);
  // Scrollbars appearing after zoom must not change the zoom's reference scale.
  const scale=Math.min((stage.offsetWidth-gap-parseFloat(stageStyle.paddingLeft)-parseFloat(stageStyle.paddingRight))/img.naturalWidth,(stage.offsetHeight-gap-parseFloat(stageStyle.paddingTop)-parseFloat(stageStyle.paddingBottom))/img.naturalHeight);
  if(scale<=0)return;
  wrap.style.width=Math.round(img.naturalWidth*scale*lbZoomLevel)+'px';
  wrap.style.height=Math.round(img.naturalHeight*scale*lbZoomLevel)+'px';
  (document.getElementById('lbFit') as HTMLButtonElement).textContent=lbZoomLevel===1?'Ajuster':Math.round(scale*lbZoomLevel*100)+' %';
  (document.getElementById('lbFit') as HTMLButtonElement).setAttribute('aria-label','Ajuster toute l’image à la fenêtre');
  if(lb().classList.contains('annot')){const c=cv();c.style.width=wrap.style.width;c.style.height=wrap.style.height;}
}
function lbSetZoom(value: number){
  lbPanX=0;lbPanY=0;(document.getElementById('lbWrap') as HTMLDivElement).style.transform='';
  const image=(document.getElementById('lbImg') as HTMLImageElement),wrap=(document.getElementById('lbWrap') as HTMLDivElement);
  const fitScale=wrap.offsetWidth/image.naturalWidth/lbZoomLevel;
  // Preserve relative zoom while permitting the explicit 100–200% choices in narrow panes.
  const maxZoom=Number.isFinite(fitScale)&&fitScale>0?Math.max(8,2.01/fitScale):8;
  const minZoom=Number.isFinite(fitScale)&&fitScale>0?Math.min(.25,1/fitScale):.25;
  lbZoomLevel=Math.max(minZoom,Math.min(maxZoom,value));lbFitImage();
  const stage=(document.getElementById('lbViewport') as HTMLDivElement);
  stage.scrollLeft=(stage.scrollWidth-stage.clientWidth)/2;
  stage.scrollTop=(stage.scrollHeight-stage.clientHeight)/2;
}
(document.getElementById('lbImg') as HTMLImageElement).addEventListener('load',lbFitImage);
let lbFitFrame=0;
new ResizeObserver(()=>{cancelAnimationFrame(lbFitFrame);lbFitFrame=requestAnimationFrame(lbFitImage);}).observe((document.getElementById('lbViewport') as HTMLDivElement));
(document.getElementById('lbFit') as HTMLButtonElement).onclick=()=>lbSetZoom(1);
(document.getElementById('lbZoomIn') as HTMLButtonElement).onclick=()=>lbSetZoom(lbZoomLevel*1.5);
(document.getElementById('lbZoomOut') as HTMLButtonElement).onclick=()=>lbSetZoom(lbZoomLevel/1.5);
(document.getElementById('lbViewport') as HTMLDivElement).addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey){e.preventDefault();lbSetZoom(lbZoomLevel*(e.deltaY<0?1.12:1/1.12));}
},{passive:false});

let lbFsUiTimer: ReturnType<typeof setTimeout> | number=0, fsLeaving=false, nativeFsOk: boolean=null, lbFsEnterGen=0, lbNativeReq=false;
function fsActiveEl(){
  return document.fullscreenElement||document.webkitFullscreenElement||null;
}
function lbOrcaFsExitAllowed(){
  let p=null; try{p=new URLSearchParams(location.search);}catch(_){}
  return !!(p&&(p.get('orcaFs')==='1'||p.get('cssFs')==='1'));
}
function lbNativeFsAllowed(){
  let p=null; try{p=new URLSearchParams(location.search);}catch(_){}
  if(p&&p.get('nativeFs')==='1') return true;   // real browsers: true whole-screen
  if(lbOrcaFsExitAllowed()) return false;       // Orca uses the server-launched native viewer
  // Orca's embedded WebKit ACCEPTS requestFullscreen() (the pane fills the whole
  // screen) but IGNORES exitFullscreen() — the pane stays stuck full-screen on
  // exit. No JS trick fixes it (tried both exit APIs + multi-frame reflow).
  // Orca is allowed into native FS only when the launcher passes ?orcaFs=1.
  // Older Orca tabs used ?cssFs=1; keep that as a legacy alias so already-open
  // gallery tabs do not remain stuck in pane-only fullscreen after upgrading.
  const brands=(navigator.userAgentData&&navigator.userAgentData.brands||[]).map((b)=>b.brand).join(' ');
  const sig=[navigator.userAgent||'',navigator.vendor||'',brands].join(' ');
  if(/\b(Orca|Electron|cmux)\b/i.test(sig)) return false;
  if(EMB) return false;
  // Real top-level browser (not Orca/Electron/cmux, not iframed): native
  // fullscreen is safe and exitFullscreen works here, so allow it even when the
  // page was opened at the bare URL without ?nativeFs=1. Embedded shells already
  // returned false above; the Orca launcher still routes through ?orcaFs=1.
  return true;
}
async function lbOrcaNativeFullscreen(){
  if(!lbOrcaFsExitAllowed()) return null;
  const rel=(lbList[lbIdx]||{}).rel||'';
  if(!rel) return {ok:false,error:'no image selected'};
  try{
    const r=await fetch('/orca-native-fullscreen',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({source:'gallery-lightbox',rel})});
    let data: {ok?:boolean;error?:string}={}; try{data=await r.json();}catch(_){}
    if(!r.ok||!data.ok) throw new Error(data.error||('HTTP '+r.status));
    return data;
  }catch(e){
    console.warn('Orca native fullscreen failed',e);
    return {ok:false,error:String(e&&e.message||e)};
  }
}
function lbFsUiPulse(){
  const el=lb(); if(!el.classList.contains('fs')) return;
  el.classList.add('fs-ui');
  clearTimeout(lbFsUiTimer);
  lbFsUiTimer=setTimeout(()=>el.classList.remove('fs-ui'),2200);
}
function lbFsEnter(){
  const el=lb(), btn=(document.getElementById('lbFs') as HTMLButtonElement);
  el.classList.add('fs');
  lbHostRequest(true);
  btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5"/></svg>';
  btn.title='Quitter le plein écran (Échap ou f)';
  btn.setAttribute('aria-label','Quitter le plein écran');
  lbZoomLevel=1;
  requestAnimationFrame(lbFitImage);
  lbFsUiPulse();
}
function lbFsExit(){
  const el=lb(), btn=(document.getElementById('lbFs') as HTMLButtonElement);
  el.classList.remove('fs','fs-ui');
  lbHostRequest(false);
  clearTimeout(lbFsUiTimer);
  document.body.classList.remove('fs-mode');
  document.body.style.overflow='';
  document.documentElement.style.overflow='';
  btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/></svg>';
  btn.title='Plein écran (f)';
  btn.setAttribute('aria-label','Plein écran');
  requestAnimationFrame(lbFitImage);
}
function lbFsReflow(){
  // Exiting (native) fullscreen resizes the embedded webview back to its pane a
  // frame or two later; a single synchronous resize fires too early and leaves
  // Orca's split pane stuck. Nudge layout repeatedly as it settles.
  const kick=()=>{void document.body.offsetHeight;window.dispatchEvent(new Event('resize'));};
  kick();
  requestAnimationFrame(()=>{kick();requestAnimationFrame(kick);});
  [60,160,320,600].forEach(ms=>setTimeout(kick,ms));
}
async function lbFsLeave(){
  if(fsLeaving) return;
  fsLeaving=true;
  lbFsEnterGen++;
  const wasNative=!!fsActiveEl()||lbNativeReq;
  lbNativeReq=false;
  try{
    lbFsExit();
    if(wasNative){
      // Orca's embedded WebKit can honor only the prefixed exit (or ignore
      // exitFullscreen entirely) — call both, don't wait for one to throw.
      try{await document.exitFullscreen?.();}catch(_){}
      try{await document.webkitExitFullscreen?.();}catch(_){}
    }
  } finally { fsLeaving=false; lbFsReflow(); }
}
async function lbFsToggle(){
  if(fsActiveEl()||lb().classList.contains('fs')){
    await lbFsLeave(); return;
  }
  if(lbOrcaFsExitAllowed()){
    await lbOrcaNativeFullscreen();
    return;
  }
  const gen=++lbFsEnterGen;
  lbFsEnter();
  document.body.classList.add('fs-mode');
  if(!lbNativeFsAllowed()){nativeFsOk=false;return;}
  if(nativeFsOk===false) return;
  const root=document.documentElement;
  const req=root.requestFullscreen||root.webkitRequestFullscreen;
  if(!req){nativeFsOk=false;return;}
  try{
    lbNativeReq=true;
    await req.call(root);
    if(gen!==lbFsEnterGen){
      if(fsActiveEl()||lbNativeReq) await lbFsLeave();
      return;
    }
    nativeFsOk=!!fsActiveEl();
  }catch(_){nativeFsOk=false;}
}
function onFsChange(){
  if(fsLeaving) return;
  if(!fsActiveEl()&&(lb().classList.contains('fs')||document.body.classList.contains('fs-mode'))){
    void lbFsLeave();
  }
}
document.addEventListener('fullscreenchange',onFsChange);
document.addEventListener('webkitfullscreenchange',onFsChange);
(document.getElementById('lbFs') as HTMLButtonElement).onclick=e=>{e.stopPropagation();lbFsToggle();};
lb().addEventListener('mousemove',lbFsUiPulse);
(document.getElementById('lbImg') as HTMLImageElement).addEventListener('dblclick',e=>{
  e.stopPropagation();
  lbSetZoom(lbZoomLevel===1?2:1);
});
document.addEventListener('keydown',e=>{
  if(!lb().classList.contains('show'))return;
  if(lb().classList.contains('annot')){
    if(annotBusy){if(e.key==='Escape')e.preventDefault();return;}
    if((e.metaKey||e.ctrlKey)&&e.key==='z'){
      if(/^(INPUT|TEXTAREA)$/.test((e.target as Element).tagName))return;e.preventDefault();annotHistory(e.shiftKey);return;
    }
    if(e.key==='Escape'){
      if(annotDrag){if(annotDrag.original)Object.assign(annotDrag.stroke,annotDrag.original);annotDrag=null;annotCur=null;annotRedraw();return;}
      const box=(document.getElementById('annotNote') as HTMLDivElement);
      if(box.style.display==='block'){box.querySelector<HTMLTextAreaElement>('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return;}
      annotToggle(); return;
    }
  }
  if(/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as Element).tagName)||(e.target as HTMLElement).isContentEditable)return;
  if(e.key==='0'){lbSetZoom(1);return;}
  if(e.key==='+'||e.key==='='){lbSetZoom(lbZoomLevel*1.5);return;}
  if(e.key==='-'){lbSetZoom(lbZoomLevel/1.5);return;}

  if(e.key==='Escape'){
    if(lb().classList.contains('fs')||fsActiveEl()){void lbFsLeave();return;}
    lbClose();
  }
  if(e.key==='ArrowLeft')lbNav(-1);
  if(e.key==='ArrowRight')lbNav(1);
});
function toggleFav(rel: string, el: { classList: { remove: (arg0: string) => void; add: (arg0: string) => void; }; }){
  if(favs.has(rel)){favs.delete(rel);el.classList.remove('on');}
  else{favs.add(rel);el.classList.add('on');}
  saveFavs();
  pushState();
  (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
  render();
}
// The app can star an open document from its tab bar (no gallery visit). The
// server already wrote .fig_state.json; we only refresh this page's in-memory
// set and its localStorage mirror — never pushState, whose stale copy would
// otherwise undo that write.
window.addEventListener('message', function(e){
  if(e.source!==window.top || !e.data || e.data.type!=='atelier-favorite-changed') return;
  const rel=e.data.rel;
  if(typeof rel!=='string' || !rel) return;
  if(e.data.fav) favs.add(rel); else favs.delete(rel);
  favsBase=favsBase.filter(f=>f!==rel);
  if(e.data.fav) favsBase.push(rel);
  saveFavs();
  (document.getElementById('favChip') as HTMLSpanElement).textContent='★ Favorites ('+favs.size+')';
  render();
});
const DEFAULT_EXTS = {png:true,jpg:true,jpeg:true,svg:true,mp4:true,m4v:true,mov:true,webm:true,pdf:false,html:false,docx:false,xlsx:false,xls:false,csv:false,md:false,py:false,r:false,jl:false,tex:false,sh:false};
const GALLERY_PROJECT_SCOPE='__ROOT__';
const galleryProjectStorageKey=(name)=>name+':'+GALLERY_PROJECT_SCOPE;
function readGalleryJson(key: string, fallback: unknown){
  try{ const value=JSON.parse(localStorage.getItem(key)||'null'); return value===null?fallback:value; }
  catch(_){ return fallback; }
}
// Project-scoped settings prevent a LaTeX-heavy project from changing the
// filters of a Python-, Julia-, or export-oriented project. Old global values
// are read once as a migration fallback, then all writes stay project-local.
const savedExts = readGalleryJson(galleryProjectStorageKey('figExts'), readGalleryJson('figExts', {}));
const exts = Object.assign({}, DEFAULT_EXTS, savedExts);
const savedExtsExplicit=localStorage.getItem(galleryProjectStorageKey('figExtsExplicit'));
let formatFilterExplicit = (savedExtsExplicit===null?localStorage.getItem('figExtsExplicit'):savedExtsExplicit)==='true'
  || Object.keys(DEFAULT_EXTS).some(k=>savedExts[k]!==undefined && savedExts[k]!==DEFAULT_EXTS[k]);
function setFormatFilterExplicit(active: boolean){
  formatFilterExplicit=!!active;
  localStorage.setItem(galleryProjectStorageKey('figExtsExplicit'), formatFilterExplicit?'true':'false');
}
// Point de passage UNIQUE du filtre de types : cache local + disque. Le
// localStorage du WebView meurt à chaque relance de l'app (PIEGES_CONNUS §1),
// donc .fig_state.json fait foi — sinon « pas de PNG dans ce projet » était
// reperdu à chaque démarrage.
const saveExts = ()=>{
  localStorage.setItem(galleryProjectStorageKey('figExts'), JSON.stringify(exts));
  pushState();
};
let showArch = true;
const fmtSize = (b) => b>1048576?(b/1048576).toFixed(1)+' MB':b>1024?(b/1024).toFixed(0)+' KB':b+' B';
const imgExt = (e) => e==='png'||e==='jpg'||e==='jpeg'||e==='svg';
const videoExt = (e) => e==='mp4'||e==='m4v'||e==='mov'||e==='webm';
const appExt = (e) => e==='docx'||e==='xlsx'||e==='xls'||e==='csv';
const codeExt = (e) => e==='py'||e==='r'||e==='jl'||e==='tex'||e==='sh';
// All file types live in this one menu (PNG/PDF/SVG/Video are no longer standalone chips).
const TYPE_LIST: Array<[string, string]> = [['png','PNG'],['jpg','JPG'],['svg','SVG'],['mp4','Video (mp4/mov/webm)'],['pdf','PDF'],['html','HTML'],['docx','DOCX'],['xlsx','XLSX'],['csv','CSV'],['md','Markdown'],['py','Python'],['r','R'],['jl','Julia'],['tex','LaTeX'],['sh','Shell']];
const DEFAULT_PINNED_TYPES=['png','svg','pdf','html','tex','py','jl'];
const BUILTIN_FILE_PRESETS=[
  {id:'figures',label:'Figures',extensions:['png','svg','pdf']},
  {id:'sources',label:'Sources',extensions:['tex','py','jl']},
  {id:'interactive',label:'Interactive',extensions:['html']},
];
const pinnedTypesKey=galleryProjectStorageKey('galleryPinnedFileTypesV1');
const customPresetsKey=galleryProjectStorageKey('galleryFileTypePresetsV1');
const storedPinnedTypes=readGalleryJson(pinnedTypesKey, DEFAULT_PINNED_TYPES);
const storedCustomPresets=readGalleryJson(customPresetsKey, []);
let pinnedFileTypes=(Array.isArray(storedPinnedTypes)?storedPinnedTypes:DEFAULT_PINNED_TYPES).filter(k=>TYPE_LIST.some(([e])=>e===k));
let customFilePresets=(Array.isArray(storedCustomPresets)?storedCustomPresets:[]).filter(p=>p&&p.id&&p.label&&Array.isArray(p.extensions));
const fmtMenu=(document.getElementById('fmtMenu') as HTMLDivElement), fmtChip=(document.getElementById('fmtChip') as HTMLSpanElement);
const typeGroup = (e) => e==='jpg'?['jpg','jpeg']:e==='mp4'?['mp4','m4v','mov','webm']:e==='xlsx'?['xlsx','xls']:[e];
function fmtChipLabel(){
  const on=FMT_CATS.filter(([,ks])=>ks.some((k)=>exts[k])).map(([lab])=>lab);
  fmtChip.innerHTML=(on.length===0?'Formats':on.length<=2?on.join(' + '):'Formats ('+on.length+')')+' &#9662;';
  fmtChip.classList.toggle('off',!on.length);
}
// 5 catégories au lieu de 15 lignes ; « Détail » déplie les types individuels
const FMT_CATS: Array<[string, string[]]> = [
  ['Images',   ['png','jpg','jpeg','svg']],
  ['Vidéos',   ['mp4','m4v','mov','webm']],
  ['Documents',['pdf','html','docx','md']],
  ['Données',  ['csv','xlsx','xls']],
  ['Code',     ['py','r','jl','tex','sh']],
];
const FMT_ICONS = {
  Images:'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.8"/><circle cx="6" cy="6.2" r="1"/><path d="M3.5 11l3.1-3 2.2 2 1.4-1.3 2.3 2.3"/></svg>',
  'Vidéos':'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="8" height="8" rx="1.8"/><path d="M10.5 6.5l3-1.7v6.4l-3-1.7z"/></svg>',
  Documents:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5.2L12 5.3v8.2H4z"/><path d="M9.2 2.5v3H12"/><path d="M6 8.3h4M6 10.5h3"/></svg>',
  'Données':'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M2.5 6.5h11M2.5 9.5h11M6 3v10M10 3v10"/></svg>',
  Code:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 5L3.4 8l2.8 3M9.8 5l2.8 3-2.8 3"/></svg>',
};
let fmtDetail = false;
const catState = (ks: string[]) => { const on = ks.filter((k)=>exts[k]).length; return on===0?'off':on===ks.length?'on':'mix'; };
function buildFmtMenu(){
  fmtMenu.innerHTML='<div class="mhd">Types de fichiers</div>'
    + '<div class="fmt-cats">'
    + FMT_CATS.map(([lab,ks],i)=>`<button class="fmt-cat ${catState(ks)}" data-cat="${i}">${FMT_ICONS[lab]||''}<span>${lab}</span></button>`).join('')
    + '</div>'
    + `<div class="madd fmt-actions" style="justify-content:space-between;gap:10px"><span class="mlink" data-fmt-detail>${fmtDetail?'Masquer le détail':'Détail…'}</span><span class="mlink" data-fmt-all="reset">Réinitialiser</span></div>`
    // Les cases restent dans le DOM même lorsque le détail historique est
    // replié : la barre React/shadcn peut ainsi exposer chaque extension.
    + TYPE_LIST.map(([e,lab])=>`<div class="mi fmt-detail-item"${fmtDetail?'':' hidden'}><label class="lbl"><input type="checkbox" data-fmt="${e}" ${exts[e]?'checked':''}> ${lab}</label></div>`).join('');
  fmtMenu.onclick=e=>e.stopPropagation();
  fmtMenu.querySelectorAll<HTMLButtonElement>('.fmt-cat').forEach(b=>{
    b.onclick=()=>{ const ks=FMT_CATS[+b.dataset.cat][1]; const turnOn = catState(ks)!=='on';
      ks.forEach((k)=>exts[k]=turnOn); setFormatFilterExplicit(true); saveExts(); buildFmtMenu(); fmtChipLabel(); render(); };
  });
  fmtMenu.querySelectorAll<HTMLInputElement>('input[data-fmt]').forEach(cb=>{
    cb.onchange=()=>{ typeGroup(cb.dataset.fmt).forEach(k=>exts[k]=cb.checked); setFormatFilterExplicit(true); saveExts(); fmtChipLabel(); buildFmtMenu(); render(); };
  });
  const dt=fmtMenu.querySelector<HTMLElement>('[data-fmt-detail]'); if(dt) dt.onclick=()=>{ fmtDetail=!fmtDetail; buildFmtMenu(); };
  const rs=fmtMenu.querySelector<HTMLElement>('[data-fmt-all="reset"]'); if(rs) rs.onclick=()=>{ Object.assign(exts, DEFAULT_EXTS); setFormatFilterExplicit(false); saveExts(); buildFmtMenu(); fmtChipLabel(); render(); };
}
fmtChip.onclick=e=>{ e.stopPropagation(); buildFmtMenu(); menuToggle(fmtMenu, fmtChip); };
// Hydrate immédiatement la source de vérité des formats pour que la barre
// React/shadcn puisse les lire sans devoir ouvrir d'abord l'ancien menu.
buildFmtMenu();
fmtChipLabel();

function galleryActiveTypeKeys(){ return TYPE_LIST.filter(([e])=>!!exts[e]).map(([e])=>e); }
function sameTypeKeys(a: Iterable<unknown>,b: Iterable<unknown>){
  const aa=[...new Set(a)].sort(), bb=[...new Set(b)].sort();
  return aa.length===bb.length&&aa.every((value,index)=>value===bb[index]);
}
function galleryFileTypesChanged(){ window.dispatchEvent(new CustomEvent('atelier-gallery-file-types-change')); }
function setGalleryActiveTypes(keys, explicit=true){
  const selected=new Set(keys.filter((k)=>TYPE_LIST.some(([e])=>e===k)));
  Object.keys(exts).forEach(k=>exts[k]=false);
  selected.forEach(k=>typeGroup(k).forEach(groupKey=>exts[groupKey]=true));
  setFormatFilterExplicit(explicit);
  saveExts();
  buildFmtMenu(); fmtChipLabel(); render(); galleryFileTypesChanged();
}
function currentGalleryView(){return {favorites:onlyFavs,collection:activeCollection||'',status:activeWorkflow||'',folder:(document.getElementById('folder') as HTMLSelectElement).value,query:(document.getElementById('q') as HTMLInputElement).value,sort:(document.getElementById('sort') as HTMLSelectElement).value,rate:rateMin,archive:showArch,hidden:showHidden};}
function applySavedGalleryView(view){
  if(!view||typeof view!=='object')return;
  onlyFavs=view.favorites===true; rateMin=Number(view.rate)||0;
  activeCollection=typeof view.collection==='string'&&collections[view.collection]?view.collection:'';
  activeWorkflow=typeof view.status==='string'?view.status:'';
  showArch=view.archive===true;showHidden=view.hidden===true;
  const folder=(document.getElementById('folder') as HTMLSelectElement),sort=(document.getElementById('sort') as HTMLSelectElement);
  folder.value=Array.from(folder.options).some(o=>o.value===view.folder)?view.folder:'';
  if(Array.from(sort.options).some(o=>o.value===view.sort))sort.value=view.sort;
  (document.getElementById('q') as HTMLInputElement).value=typeof view.query==='string'?view.query:'';
  const favorite=(document.getElementById('favChip') as HTMLSpanElement);favorite.classList.toggle('on',onlyFavs);favorite.classList.toggle('off',!onlyFavs);
  (document.getElementById('rateFilter') as HTMLSpanElement).style.display=onlyFavs?'inline-flex':'none';
  buildCollectionChip();buildWorkflowChip();updateViewChip();
}
function galleryFileTypePresets(){
  const active=galleryActiveTypeKeys();
  return [...BUILTIN_FILE_PRESETS.map(p=>({...p,custom:false})),...customFilePresets.map(p=>({...p,custom:true}))]
    .map(p=>({...p,active:sameTypeKeys(active,p.extensions)&&(!p.view||Object.entries(currentGalleryView()).every(([key,value])=>p.view[key]===value))}));
}
window.__galleryFileTypes={
  getState(){
    const active=galleryActiveTypeKeys(), presets=galleryFileTypePresets();
    const match=presets.find(p=>p.active);
    const activeLabels=TYPE_LIST.filter(([e])=>active.includes(e)).map(([,label])=>label);
    return {
      projectName:GALLERY_PROJECT_SCOPE.split('/').filter(Boolean).pop()||'this project',
      types:TYPE_LIST.map(([key,label])=>({key,label,active:active.includes(key),pinned:pinnedFileTypes.includes(key)})),
      pinned:[...pinnedFileTypes],
      presets,
      summary:match?match.label:(activeLabels.length<=2?activeLabels.join(' + '):'Custom file types'),
    };
  },
  setActive(keys){ setGalleryActiveTypes(keys,true); },
  setPinned(keys: Iterable<unknown>){
    pinnedFileTypes=[...new Set(keys)].filter(k=>TYPE_LIST.some(([e])=>e===k));
    localStorage.setItem(pinnedTypesKey,JSON.stringify(pinnedFileTypes));
    pushState();
    galleryFileTypesChanged();
  },
  applyPreset(id){
    const preset=galleryFileTypePresets().find(p=>p.id===id);
    if(preset){applySavedGalleryView(preset.view);setGalleryActiveTypes(preset.extensions,true);}
  },
  savePreset(name){
    const label=String(name||'').trim(); if(!label)return;
    const id='custom-'+Date.now().toString(36);
    customFilePresets.push({id,label,extensions:galleryActiveTypeKeys(),view:currentGalleryView()});
    localStorage.setItem(customPresetsKey,JSON.stringify(customFilePresets));
    pushState();
    galleryFileTypesChanged();
  },
  removePreset(id){
    customFilePresets=customFilePresets.filter(p=>p.id!==id);
    localStorage.setItem(customPresetsKey,JSON.stringify(customFilePresets));
    pushState();
    galleryFileTypesChanged();
  },
  resetFilters(){ clearAllFilters(); galleryFileTypesChanged(); },
};

const fsel = (document.getElementById('folder') as HTMLSelectElement);
function populateFolders(){
  const keep=fsel.value;
  fsel.innerHTML='';
  // l option « tous » (valeur vide) doit SURVIVRE au repeuplement — sinon le
  // premier dossier devient le filtre actif et la galerie paraît vide
  const all=document.createElement('option'); all.value=''; all.textContent='All folders'; fsel.appendChild(all);
  FOLDERS.forEach((f)=>{const o=document.createElement('option');o.value=f;o.textContent=f;fsel.appendChild(o);});
  fsel.value = FOLDERS.includes(keep) ? keep : '';
}
populateFolders();

// lazily fetch code snippets only for cards that scroll into view (data stays light)
const snipObserver = new IntersectionObserver((entries,obs)=>{
  for(const e of entries){
    if(!e.isIntersecting) continue;
    const el=e.target; obs.unobserve(el);
    fetch('/snippet?path='+encodeURIComponent('__ROOT__/'+(el as HTMLElement).dataset.snip)+'&n=10')
      .then(r=>r.ok?r.text():'').then(t=>{el.textContent=t;}).catch(()=>{});
  }
},{rootMargin:'250px'});
// Both presentations consume the same filtered files and selection model.
let presentationTouched=false;
const presentationKey=galleryProjectStorageKey('galleryPresentationV1');
const storedPresentation=readGalleryJson(presentationKey,{});
let galleryPresentation: GalleryPresentation={mode:storedPresentation?.mode==='list'?'list':'grid',size:Math.max(150,Math.min(320,Number(storedPresentation?.size)||185)),rows:storedPresentation?.rows==='compact'?'compact':'comfortable'};
const detailColumns: Array<[GalleryColumn, string, number]> =[['name','Nom',300],['type','Type',90],['size','Taille',100],['mtime','Modification',145],['status','Statut',115]];
const detailWidths: Partial<Record<GalleryColumn, number>>={};
for(const [key,,width] of detailColumns) detailWidths[key]=Math.max(70,Math.min(800,Number(storedPresentation?.widths?.[key])||width));
function persistPresentation(){presentationTouched=true;try{localStorage.setItem(presentationKey,JSON.stringify({...galleryPresentation,widths:detailWidths}));}catch{}pushState();}
function restorePresentation(value: Partial<GalleryPresentation> & {widths?: Partial<Record<GalleryColumn, number>>}){
  if(!value||typeof value!=='object')return;
  if(value.mode==='grid'||value.mode==='list')galleryPresentation.mode=value.mode;
  if(Number.isFinite(value.size))galleryPresentation.size=Math.max(150,Math.min(320,value.size));
  if(value.rows==='compact'||value.rows==='comfortable')galleryPresentation.rows=value.rows;
  for(const [key] of detailColumns)if(Number.isFinite(value.widths?.[key]))detailWidths[key]=Math.max(70,Math.min(800,value.widths[key]));
  applyPresentation();window.dispatchEvent(new CustomEvent('atelier-gallery-presentation-change'));
}
function applyPresentation(){
  const grid=(document.getElementById('grid') as HTMLElement);
  grid.classList.toggle('gallery-detail-list',galleryPresentation.mode==='list');
  grid.setAttribute('role',galleryPresentation.mode==='list'?'grid':'listbox');
  document.documentElement.style.setProperty('--card-min',galleryPresentation.size+'px');
  document.documentElement.style.setProperty('--thumb-h',Math.round(galleryPresentation.size*.72)+'px');
  grid.style.setProperty('--detail-row-height',galleryPresentation.rows==='compact'?'34px':'46px');
  grid.style.setProperty('--detail-columns',detailColumns.map(([key])=>detailWidths[key]+'px').join(' '));
}
window.__galleryPresentation={
  getState(){return {...galleryPresentation};},
  set(patch: Partial<GalleryPresentation>){
    if(patch.mode==='grid'||patch.mode==='list') galleryPresentation.mode=patch.mode;
    if(Number.isFinite(patch.size)) galleryPresentation.size=Math.max(150,Math.min(320,patch.size));
    if(patch.rows==='compact'||patch.rows==='comfortable') galleryPresentation.rows=patch.rows;
    persistPresentation(); applyPresentation(); render();
    window.dispatchEvent(new CustomEvent('atelier-gallery-presentation-change'));
  }
};
function detailSort(key: string|number){
  const input=(document.getElementById('sort') as HTMLSelectElement);
  const reverse={name:'name_desc',type:'type_desc',size:'size_asc',mtime:'mtime_asc',status:'status_desc'};
  input.value=input.value===key?reverse[key]:key;
  input.dispatchEvent(new Event('change',{bubbles:true}));
}
function detailHeader(sort: string){
  return '<div class="gallery-detail-header" role="row">'+detailColumns.map(([key,label])=>{
    const active=sort===key||sort===key+'_desc'||sort===key+'_asc';
    const descending=sort.endsWith('_desc')||(key==='mtime'||key==='size')&&!sort.endsWith('_asc');
    return '<div role="columnheader" aria-sort="'+(active?(descending?'descending':'ascending'):'none')+'"><button data-detail-sort="'+key+'">'+label+(active?(descending?' ↓':' ↑'):'')+'</button><span class="gallery-column-resize" role="separator" tabindex="0" aria-label="Largeur : '+label+'" aria-orientation="vertical" aria-valuemin="70" aria-valuemax="800" aria-valuenow="'+detailWidths[key]+'" data-detail-resize="'+key+'"></span></div>';
  }).join('')+'</div>';
}
function bindDetailHeader(grid: HTMLElement){
  grid.querySelectorAll<HTMLElement>('[data-detail-sort]').forEach((button)=>button.onclick=()=>{const key=button.dataset.detailSort;detailSort(key);(grid.querySelector('[data-detail-sort="'+key+'"]') as HTMLElement).focus();});
  grid.querySelectorAll<HTMLElement>('[data-detail-resize]').forEach((handle)=>{
    const key=handle.dataset.detailResize;
    const resize=(width)=>{detailWidths[key]=Math.max(70,Math.min(800,width));handle.setAttribute('aria-valuenow',detailWidths[key]);applyPresentation();persistPresentation();};
    handle.onkeydown=(e)=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();resize(detailWidths[key]+(e.key==='ArrowRight'?10:-10));}};
    handle.onpointerdown=(e)=>{e.preventDefault();e.stopPropagation();const x=e.clientX,width=detailWidths[key];handle.setPointerCapture(e.pointerId);handle.onpointermove=(ev)=>resize(width+ev.clientX-x);handle.onpointerup=handle.onpointercancel=()=>{handle.onpointermove=null;};};
  });
}
(document.getElementById('grid') as HTMLElement).addEventListener('dblclick',e=>{const row=(e.target as Element).closest<HTMLDivElement>('.gallery-detail-row');if(row&&!(e.target as Element).closest<HTMLButtonElement>('button'))lbOpenAny(row.dataset.card);});
function render(){
  // Chaque rendu remplace entièrement la grille. IntersectionObserver conserve
  // sinon les anciennes cartes code détachées tant qu'elles ne sont jamais
  // entrées dans le viewport; après beaucoup de recherches/rescans, ces cibles
  // mortes finissent par faire grossir la page et peuvent bloquer les clics.
  snipObserver.disconnect();
  if(typeof renderActiveChips==='function') renderActiveChips();  // plan 019 : chips de filtres actifs
  const normalizeSearch = (value) => String(value||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const terms = normalizeSearch((document.getElementById('q') as HTMLInputElement).value).split(/\s+/).filter(Boolean);
  const sort = (document.getElementById('sort') as HTMLSelectElement).value;
  const fld = fsel.value;
  let list = FILES.filter(f=>{
    // Le focus demandé par le chat est une vue temporaire explicite. Il prime
    // sur les filtres persistants pour que « montre ces figures » ne puisse pas
    // aboutir à une grille vide à cause d'un ancien filtre utilisateur.
    if(chatFocusRels.size) return chatFocusRels.has(f.rel);
    // Un favori ne doit JAMAIS sembler perdu : la vue Favoris est déjà une
    // vue ciblée, elle montre tous les favoris quel que soit le filtre de
    // types — même explicite (vécu 2026-08-31 : .py mis en favori depuis
    // l'app, projet filtré csv/jpg/mp4/png/tex → invisible dans ★ Favorites).
    // Sans filtre de type choisi explicitement, une recherche textuelle porte
    // sur tous les fichiers indexés. Dès que l'utilisateur choisit un format,
    // recherche et types se combinent au lieu que l'un annule l'autre.
    if((!terms.length || formatFilterExplicit) && !exts[f.ext]
      && !(onlyFavs && favs.has(f.rel))) return false;
    if(!showArch && f.archive) return false;
    if(!showHidden && (hidden.has(f.rel) || matchesRule(f.rel))) return false;
    if(activeCollection && !(collections[activeCollection]||[]).includes(f.rel)) return false;
    if(activeWorkflow && workflow[f.rel]!==activeWorkflow) return false;
    if(onlyFavs && !favs.has(f.rel)) return false;
    if(onlyFavs && rateMin && (ratings[f.rel]||0)!==rateMin) return false;
    if(fld && f.folder!==fld) return false;
    if(terms.length){ const hay=normalizeSearch(f.rel); if(!terms.every(t=>hay.includes(t))) return false; }
    return true;
  });
  list.sort((a,b)=>{
    if(sort==='rating_asc') return (ratings[a.rel]||0)-(ratings[b.rel]||0) || a.name.localeCompare(b.name);
    if(sort==='rating') return (ratings[b.rel]||0)-(ratings[a.rel]||0) || b.mtime-a.mtime;
    if(sort==='name' || sort==='name_desc') return a.name.localeCompare(b.name)*(sort==='name'?1:-1);
    if(sort==='type' || sort==='type_desc') return (a.ext.localeCompare(b.ext)||a.name.localeCompare(b.name))*(sort==='type'?1:-1);
    if(sort==='status' || sort==='status_desc') return (String(workflow[a.rel]||'').localeCompare(String(workflow[b.rel]||''))||a.name.localeCompare(b.name))*(sort==='status'?1:-1);
    if(sort==='size_asc') return a.size-b.size;
    if(sort==='size') return b.size-a.size;
    if(sort==='mtime_asc') return a.mtime-b.mtime;
    if(sort==='btime') return b.btime-a.btime;
    if(sort==='btime_asc') return a.btime-b.btime;
    return b.mtime-a.mtime;
  });
  lbList = list.filter(f=>imgExt(f.ext)||videoExt(f.ext)||f.ext==='pdf'||f.ext==='md'||codeExt(f.ext));
  lbListSaved=null; // la vue vient d'être rebâtie : plus rien à restaurer
  const grid=(document.getElementById('grid') as HTMLElement);
  applyPresentation();
  if(!list.length){
    // deux états distincts : projet vide vs zéro résultat avec filtres actifs
    const hasQ=!!(document.getElementById('q') as HTMLInputElement).value.trim();
    grid.innerHTML = FILES.length===0
      ? '<div class="empty">No files in this project yet.<br><span style="font-size:11px;color:var(--faint)">Add figures, data or scripts, then Rescan.</span></div>'
      : '<div class="empty">No matching files.'
        +' <button id="emptyReset" style="margin-left:8px;height:26px;font-size:11px">Clear search &amp; filters</button></div>';
    const er=(document.getElementById('emptyReset') as HTMLButtonElement);
    if(er) er.onclick=()=>{ const q=(document.getElementById('q') as HTMLInputElement); if(q.value){q.value='';} clearAllFilters(); render(); };
    renderedRels=[];
    if(selectedRel) closeInspector(false);   // la sélection n'est plus visible
    void hasQ;
    return;
  }
  const MAX=600;
  const slice=list.slice(0,MAX);
  renderedRels = slice.map(f=>f.rel);   // display order for Shift-click range selection
  grid.innerHTML = (galleryPresentation.mode==='list'?detailHeader(sort):'') + slice.map(f=>{
    if(galleryPresentation.mode==='list'){
      const selected=selSet.has(f.rel), wf=({'draft':'Brouillon','candidate':'Candidat','final':'Final','rejected':'Rejeté'})[workflow[f.rel]]||'';
      return `<div class="card gallery-detail-row ${selectedRel===f.rel?'sel2':''} ${selected?'bulk-selected':''}" data-card="${escA(f.rel)}" role="row" aria-selected="${selected}">
        <div class="gallery-detail-name" role="gridcell"><button class="selbox ${selected?'on':''}" data-act="sel" data-rel="${escA(f.rel)}" aria-label="Sélectionner ${escA(f.name)}">${selected?'■':'▢'}</button><button class="gallery-detail-open" data-act="${imgExt(f.ext)||videoExt(f.ext)||f.ext==='pdf'||f.ext==='md'||codeExt(f.ext)?'lb':'open'}" data-rel="${escA(f.rel)}" title="${escA(f.rel)}">${esc(f.name)}</button>${favs.has(f.rel)?'<span class="fv">★</span>':''}</div>
        <div role="gridcell">${esc(f.ext.toUpperCase())}</div><div role="gridcell">${fmtSize(f.size)}</div><div role="gridcell">${esc(f.mdate)}</div><div role="gridcell" class="gallery-detail-status"><span>${esc(wf)}</span><button data-act="more" data-rel="${escA(f.rel)}" aria-label="Actions pour ${escA(f.name)}">${hovIco('more')}</button></div>
      </div>`;
    }
    const isImg = imgExt(f.ext);
    const isHtml = f.ext === 'html' || f.ext === 'htm';
    // images: light downscaled thumbnail from the server (full-res stays in the lightbox);
    // html: headless-Chrome render of the page; pdf/office: build-time qlmanage thumb.
    const tsrc = (isImg || isHtml) ? '/thumb?path='+encodeURIComponent('__ROOT__/'+f.rel)+'&w=480&v='+f.mtime : (f.thumb||null);
    const imgTag = isImg
      ? `<img loading="lazy" decoding="async" src="${escA(tsrc)}" data-full="${escA(f.rel)}?v=${f.mtime}" onerror="this.onerror=null;this.src=this.dataset.full" alt="">`
      : isHtml
      ? `<img loading="lazy" decoding="async" src="${escA(tsrc)}" alt="" onerror="this.onerror=null;this.remove()">`
      : `<img loading="lazy" decoding="async" src="${escA(tsrc)}" alt="">`;
    const thumb = f.code
      ? `<div class="snip" data-snip="${escA(f.rel)}"></div>`
      : tsrc
      ? `<div class="thumb">${imgTag}</div>`
      : `<div class="ph"><span class="ext">${esc(f.ext.toUpperCase())}</span><span style="font-size:11px">no preview</span></div>`;
    const arch = f.archive?`<span class="tag archive">archive</span>`:'';
    const isFav = favs.has(f.rel);
    const isHid = hidden.has(f.rel);
    const hidTag = isHid?`<span class="tag hid">hidden</span>`:'';
    const wf = workflow[f.rel];
    const wfTag = wf?`<span class="tag wf${wf==='final'?' final':''}">${esc(wf)}</span>`:'';
    const rt = ratings[f.rel]||0;
    return `<div class="card ${f.archive?'arch':''} ${isHid?'hid':''} ${selectedRel===f.rel?'sel2':''}" data-card="${escA(f.rel)}" role="option" aria-selected="${selectedRel===f.rel}">
      <span class="selbox ${selSet.has(f.rel)?'on':''}" data-act="sel" data-rel="${escA(f.rel)}" title="Select — Shift-click to select a range">${selSet.has(f.rel)?'■':'▢'}</span>
      ${(imgExt(f.ext)||videoExt(f.ext)||f.ext==='pdf'||f.ext==='md'||codeExt(f.ext))?`<div data-act="lb" data-rel="${escA(f.rel)}" style="cursor:zoom-in;position:relative">${videoExt(f.ext)?'<span class="playbtn">&#9654;</span>':''}${thumb}</div>`:appExt(f.ext)?`<div data-act="open" data-rel="${escA(f.rel)}" style="cursor:pointer" title="Open with default app">${thumb}</div>`:`<a href="${escA(f.rel)}" target="_blank" style="text-decoration:none">${thumb}</a>`}
      <div class="hov">
        <button data-act="open" data-rel="${escA(f.rel)}" aria-label="${EMB&&(f.ext==='tex'||f.ext==='md'||f.ext==='pdf'||f.ext==='csv'||codeExt(f.ext))?'Open in Atelier IDE':'Open with default app'}" title="${EMB&&(f.ext==='tex'||f.ext==='md'||f.ext==='pdf'||f.ext==='csv'||codeExt(f.ext))?'Open in Atelier IDE':'Open with default app'}">${hovIco('open')}</button>
        <button data-act="copy" data-rel="${escA(f.rel)}" aria-label="Copy path" title="Copy path">${hovIco('copy')}</button>
        <button data-act="chat" data-rel="${escA(f.rel)}" class="embOnly" aria-label="Joindre au chat de Studio" title="Joindre au chat de Studio">${hovIco('chat')}</button>
        ${(imgExt(f.ext)||f.ext==='pdf')?`<button data-act="src" data-rel="${escA(f.rel)}" class="embHide" aria-label="Open the script that generated this figure" title="Open the script that generated this figure">${hovIco('src')}</button>`:''}
        ${imgExt(f.ext)?`<button data-act="board" data-rel="${escA(f.rel)}" class="embHide" aria-label="Send this figure to the whiteboard" title="Send this figure to the whiteboard">${hovIco('board')}</button>`:''}
        <button data-act="fav" data-rel="${escA(f.rel)}" class="${isFav?'on':''}" aria-pressed="${isFav}" aria-label="${isFav?'Remove favorite':'Add favorite'}" title="${isFav?'Remove favorite':'Add favorite'}">${hovIco('fav')}</button>
        <button data-act="more" data-rel="${escA(f.rel)}" aria-label="Rating, hide, delete" title="Rating, hide, delete">${hovIco('more')}</button>
      </div>
      <div class="meta">
        <div class="nm" title="${escA(f.name)}" aria-label="${escA(f.name)}">${fileNameLabel(f.name)}</div>
        <div class="row2">${isFav?'<span class="fv">★</span>':''}${rt?`<span class="rt">★${rt}</span>`:''}${arch}${hidTag}${wfTag}<span class="mf" title="${escA(f.rel)} · ${fmtSize(f.size)}">${esc(f.ext.toUpperCase())}</span><span class="md" title="${escA(f.rel)} · ${fmtSize(f.size)} · created ${escA(f.bdate)} · modified ${escA(f.mdate)}">${esc((sort.startsWith('btime')?f.bdate:f.mdate).slice(0,10))}</span></div>
      </div>
    </div>`;
  }).join('') + (list.length>MAX?`<div class="empty">… and ${list.length-MAX} more. Refine your search to see them.</div>`:'');
  if(galleryPresentation.mode==='list') bindDetailHeader(grid);
  grid.querySelectorAll<HTMLDivElement>('.snip[data-snip]').forEach(el=>snipObserver.observe(el));
  // plan 019 : la sélection survit au rerender si la carte reste visible ;
  // sinon l'inspecteur se ferme sans voler le focus
  if(selectedRel){
    if(renderedRels.includes(selectedRel)){ paintSelection(); updateInspector(); }
    else closeInspector(false);
  }
}
// (format quick-chips + their video-solo handler removed — all types now live in the Formats menu)
updateViewChip();
const favChip=(document.getElementById('favChip') as HTMLSpanElement);
favChip.textContent='★ Favorites ('+favs.size+')';
const rateFilter=(document.getElementById('rateFilter') as HTMLSpanElement);
rateFilter.innerHTML=[1,2,3,4,5].map(n=>`<span class="chip off rf" data-n="${n}" title="Show only ${n}-star items">${n}★</span>`).join('');
rateFilter.querySelectorAll<HTMLSpanElement>('.rf').forEach(c=>{
  c.onclick=()=>{
    const n=+c.dataset.n;
    rateMin = rateMin===n ? 0 : n;
    rateFilter.querySelectorAll<HTMLSpanElement>('.rf').forEach(x=>{const on=+x.dataset.n===rateMin;x.classList.toggle('on',on);x.classList.toggle('off',!on);});
    render();
  };
});
favChip.onclick=()=>{onlyFavs=!onlyFavs;favChip.classList.toggle('off',!onlyFavs);favChip.classList.toggle('on',onlyFavs);rateFilter.style.display=onlyFavs?'inline-flex':'none';if(!onlyFavs){rateMin=0;rateFilter.querySelectorAll<HTMLSpanElement>('.rf').forEach(x=>{x.classList.remove('on');x.classList.add('off');});}render();};
const quoteBtn=(document.getElementById('quoteClear') as HTMLButtonElement);
function quoteCheck(){fetch('/quote').then(r=>r.json()).then(j=>{quotePending=!!j.pending;quoteBtn.style.display=j.pending?'':'none';}).catch(()=>{});}
quoteCheck(); setInterval(() => { if (!document.hidden) quoteCheck(); }, 30000);
checkHealth(); setInterval(() => { if (!document.hidden) checkHealth(); }, 60000);
quoteBtn.onclick=async()=>{await fetch('/clear-quote',{method:'POST'}).catch(()=>{}); quoteBtn.style.display='none';};
(document.getElementById('rescan') as HTMLButtonElement).onclick=async function(){
  if((this as HTMLElement).classList.contains('spinning')) return;
  (this as HTMLElement).classList.add('spinning');
  try{
    const r=await fetch('/rescan',{method:'POST'});
    const j=await r.json();
    if(j.ok){
      const data=await fetch('/data',{cache:'no-store'}).then(x=>x.ok?x.json():null);
      applyGalleryData(data);
      (this as HTMLElement).classList.remove('spinning');
      return;
    }
    (this as HTMLElement).title='Rescan — erreur, réessayer';
  }catch(e){ (this as HTMLElement).title='Rescan — serveur injoignable'; }
  (this as HTMLElement).classList.remove('spinning');
};
(document.getElementById('delSel') as HTMLButtonElement).onclick=async function(){
  if(!selSet.size) return;
  if(!await confirmDialog(selSet.size+' file(s) → trash?')) return;
  const r=await fetch('/delete',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({rels:[...selSet]})});
  const j=await r.json();
  (j.deleted||[]).forEach((rel)=>{
    const i=FILES.findIndex(f=>f.rel===rel);
    if(i>=0) FILES.splice(i,1);
    selSet.delete(rel);
  });
  updateDelBtn(); render();
};
window.__gallerySelection={
  getState(){
    const rels=[...selSet];
    return {rels,imageCount:rels.filter(rel=>imgExt(rel.split('.').pop().toLowerCase())).length};
  },
  open(){ const rel=[...selSet][0]; if(rel)lbOpenAny(rel); },
  compare(){ if([...selSet].filter(rel=>imgExt(rel.split('.').pop().toLowerCase())).length>=2)openCompare(); },
  collect(anchor){ if(selSet.size)collectSelMenu(anchor); },
  export(anchor){ if(selSet.size){buildExportMenu();menuToggle((document.getElementById('exportMenu') as HTMLDivElement),anchor);} },
  hide(){ (document.getElementById('hideSel') as HTMLButtonElement).click(); },
  delete(){ (document.getElementById('delSel') as HTMLButtonElement).click(); },
  clear(){ clearSel(); },
};
// debounce : render() reconstruit jusqu'à 600 cartes — une frappe rapide ne
// doit payer qu'un rendu, pas un par lettre (audit perf 2026-08-28)
{ let qTimer: ReturnType<typeof setTimeout> | number = 0;
  (document.getElementById('q') as HTMLInputElement).oninput = () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(render, 120);
  };
}
(document.getElementById('sort') as HTMLSelectElement).onchange=render;
fsel.onchange=render;
// collapsible search: a 🔍 chip expands the field; Esc / blur-when-empty collapses it; "/" opens it
const qEl=(document.getElementById('q') as HTMLInputElement), searchChip=(document.getElementById('searchChip') as HTMLSpanElement);
function openSearch(){qEl.classList.remove('collapsed');searchChip.classList.add('on');qEl.focus();qEl.select();}
function closeSearch(){const had=qEl.value;qEl.value='';qEl.classList.add('collapsed');searchChip.classList.remove('on');if(had)render();}
searchChip.onclick=()=>{ if(qEl.classList.contains('collapsed')) openSearch(); else closeSearch(); };
qEl.addEventListener('keydown',e=>{ if(e.key==='Escape'){e.preventDefault();closeSearch();searchChip.focus();} });
qEl.addEventListener('blur',()=>{ if(!qEl.value.trim()){qEl.classList.add('collapsed');searchChip.classList.remove('on');} });
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&selSet.size&&!lb().classList.contains('show')){e.preventDefault();clearSel();return;}
  if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey)return;
  if(lb().classList.contains('show'))return;
  const t=e.target, tag=t&&(t as Element).tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&(t as HTMLElement).isContentEditable))return;
  e.preventDefault(); openSearch();
});
// ---- Annotation ----
let annotTool='rect', annotStrokes: FigureStroke[]=[], annotCur=null, annotSent=true;
const annotSessions=new Map<string, AnnotationSession>();
let annotSession: AnnotationSession | null=null, annotSelected: FigureStroke | null=null, annotDrag=null, annotSendOne=null, annotBusy=false;

// Barre unique du visionneur (B′, Thierry 2026-09-11) : ⓘ · ‹ n/N › · zoom ·
// annoter · chat · ⋯ · ×. Le nom et tout ce qui décrit le fichier vivent
// dans la fiche sous ⓘ ; provenance y est aussi. Plein écran et fond dans ⋯.
const lbHead=document.createElement('div');lbHead.id='lbHead';
lbHead.innerHTML='<button id="lbInfoBtn" aria-label="Informations sur le fichier" aria-expanded="false" aria-controls="lbSheet"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.2"/></svg></button>'
 +'<div id="lbSheet" role="dialog" aria-label="Informations sur le fichier" hidden><div id="lbInfo"></div><div id="lbSheetActs"><a id="lbOriginal" target="_blank" rel="noopener">Ouvrir l’original ↗</a><button id="lbCopyPath" type="button">Copier le chemin</button></div></div>'
 +'<span class="lb-space"></span>'
 +'<button id="lbAdd" title="Ajouter au brouillon du chat" aria-label="Ajouter au brouillon du chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM8 11h8m-4-4v8"/></svg></button>'
 +'<details id="lbMore"><summary aria-label="Autres actions">⋯</summary><div><div id="lbBackground" role="group" aria-label="Fond de la figure"><span>Fond</span><button data-backdrop="atelier" title="Atelier" aria-label="Fond Atelier" aria-pressed="true" style="--swatch:var(--bg)"></button><button data-backdrop="#303335" title="Graphite" aria-label="Fond graphite" aria-pressed="false" style="--swatch:#303335"></button><button data-backdrop="#252b30" title="Ardoise" aria-label="Fond ardoise" aria-pressed="false" style="--swatch:#252b30"></button></div></div></details>'
 +'<div id="lbNameToast" aria-hidden="true"></div>';
lb().prepend(lbHead);
function setFigureBackdrop(color: string){
  const options=[...document.querySelectorAll<HTMLElement>('[data-backdrop]')];
  if(!options.some(b=>b.dataset.backdrop===color))color='atelier';
  if(color==='atelier')lb().style.removeProperty('--figure-backdrop');else lb().style.setProperty('--figure-backdrop',color);
  options.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.backdrop===color)));
  try{localStorage.setItem('atelier.figureBackdrop',color);}catch{}
}
let figureBackdrop;try{figureBackdrop=localStorage.getItem('atelier.figureBackdrop');}catch{}
setFigureBackdrop(figureBackdrop);
document.querySelectorAll<HTMLElement>('[data-backdrop]').forEach(b=>b.onclick=()=>setFigureBackdrop(b.dataset.backdrop));
// Ordre dans la barre : ⓘ · ‹ n/N › · zoom · annoter · [outils d'annotation] · espace · chat · ⋯ · ×
const lbSheet=(document.getElementById('lbSheet') as HTMLDivElement);
lbSheet.prepend((document.getElementById('lbCap') as HTMLDivElement));
(document.getElementById('lbSheetActs') as HTMLDivElement).prepend((document.getElementById('lbProv') as HTMLButtonElement));
const lbSpace=lbHead.querySelector<HTMLSpanElement>('.lb-space');
for(const id of ['lbPrev','lbNext','lbZoom','lbAnnot','annotBar','annotPill'])lbSpace.before(document.getElementById(id));
lbHead.append((document.getElementById('lbClose') as HTMLButtonElement));
lbHead.insertBefore((document.getElementById('lbFs') as HTMLButtonElement),(document.getElementById('lbClose') as HTMLButtonElement));
const lbPosition=document.createElement('span');lbPosition.id='lbPosition';(document.getElementById('lbPrev') as HTMLButtonElement).after(lbPosition);
// Figure history is separate from gallery navigation. Each snapshot is immutable
// and stored by the project server, not in this webview's cache.
const lbVersions=document.createElement('div');lbVersions.id='lbVersions';lbVersions.hidden=true;
lbVersions.setAttribute('role','group');lbVersions.setAttribute('aria-label','Versions de la figure');
lbVersions.innerHTML='<button type="button" class="lbBtn" id="lbVersionPrev" aria-label="Version précédente">‹</button><button type="button" class="lbBtn" id="lbVersionCurrent" aria-label="Version actuelle" aria-live="polite">v1</button><button type="button" class="lbBtn" id="lbVersionNext" aria-label="Version suivante">›</button>';
(document.getElementById('lbPrev') as HTMLButtonElement).before(lbVersions);
const lbFigureNavigation=document.createElement('div');lbFigureNavigation.id='lbFigureNavigation';
lbFigureNavigation.setAttribute('role','group');lbFigureNavigation.setAttribute('aria-label','Parcourir les figures');
lbFigureNavigation.append('Figures ',(document.getElementById('lbPrev') as HTMLButtonElement),lbPosition,(document.getElementById('lbNext') as HTMLButtonElement));
lbSheet.append(lbFigureNavigation);
const lbVersionStyle=document.createElement('style');lbVersionStyle.textContent='#lbVersions{display:flex;align-items:center;flex:none;border:1px solid var(--border);border-radius:6px;margin-right:6px}#lbVersions[hidden]{display:none}#lbVersions .lbBtn{position:static;min-width:22px;width:auto;height:26px;padding:0 5px;font-size:15px}#lbVersions #lbVersionCurrent{font-size:11px;white-space:nowrap;color:var(--muted)}#lbVersions .lbBtn:disabled{opacity:.35;cursor:default}';document.head.appendChild(lbVersionStyle);
lbVersionStyle.textContent+='#lbFigureNavigation{display:flex;align-items:center;gap:4px;margin-top:8px;color:var(--muted);font-size:11px}#lb #lbFigureNavigation .lbBtn{position:static;display:inline-flex;align-items:center;justify-content:center}';
let lbHistory: FigureHistory={rel:'',rows:[],selected:null,follow:true,epoch:0,busy:false};
let lbVersionReady=Promise.resolve();
function lbVersionsReset(f: { ext: string; rel: string; }){
  lbHistory={rel:f&&['png','jpg','jpeg'].includes(f.ext)?f.rel:'',rows:[],selected:null,follow:true,epoch:lbHistory.epoch+1,busy:false};
  lbVersionReady=Promise.resolve();lbVersions.hidden=!lbHistory.rel;
  (document.getElementById('lbVersionCurrent') as HTMLButtonElement).textContent='…';
  (document.getElementById('lbVersionCurrent') as HTMLButtonElement).title='Historique des versions enregistrées à partir de l’ouverture de cette figure';
  for(const id of ['lbVersionPrev','lbVersionNext'])(document.getElementById(id) as HTMLInputElement).disabled=true;
}
function lbAnnotationKey(){
  const rel=lbList[lbIdx]?.rel;
  return lbHistory.rel===rel&&lbHistory.selected!=null?rel+'::version:'+lbHistory.selected:rel;
}
function lbVersionsPaint(){
  const h=lbHistory,idx=h.rows.findIndex(r=>r.version===h.selected),last=h.rows.at(-1);
  const current=(document.getElementById('lbVersionCurrent') as HTMLButtonElement);
  current.textContent=h.selected==null?'…':'v'+h.selected;
  current.dataset.pending=String(!!last&&last.version!==h.selected);
  current.title=last&&last.version!==h.selected?'Afficher la dernière version (v'+last.version+')':'Dernière version · mises à jour automatiques';
  current.setAttribute('aria-label',current.title);
  (document.getElementById('lbVersionPrev') as HTMLButtonElement).disabled=idx<=0;
  (document.getElementById('lbVersionNext') as HTMLButtonElement).disabled=idx<0||idx>=h.rows.length-1;
}
async function lbVersionDisplay(version: number,automatic=false){
  const h=lbHistory;if(!h.rel||h.selected===version)return;
  const display= h.display=(h.display||0)+1;
  const blocked=()=>annotBusy||annotDrag||annotCur||(document.getElementById('annotNote') as HTMLDivElement).style.display==='block'||(automatic&&lb().classList.contains('annot')&&annotStrokes.length>0);
  if(blocked())return;
  const url='/figure-version?path='+encodeURIComponent(h.rel)+'&version='+version;
  const image=new Image();image.src=url;
  try{await image.decode();}catch{return;}
  if(h!==lbHistory||h.display!==display||!lb().classList.contains('show')||blocked()||(automatic&&!h.follow))return;
  if(!(await annotGuard())||h!==lbHistory)return;
  const annotating=lb().classList.contains('annot');
  // Annotations started before the first snapshot response belong to v1.
  if(h.selected==null&&annotSessions.has(h.rel)){
    annotSessions.set(h.rel+'::version:'+version,annotSessions.get(h.rel));annotSessions.delete(h.rel);
  }
  h.selected=version;
  const img=(document.getElementById('lbImg') as HTMLImageElement);img.src=url;
  // The preloaded immutable URL has decoded; retain zoom and pan during updates.
  annotSession=null;annotStrokes=[];annotSelected=null;annotPillUpdate();
  (document.getElementById('lbOriginal') as HTMLAnchorElement).href=url;
  lbVersionsPaint();
  if(annotating){
    const key=lbAnnotationKey();
    if(!annotSessions.has(key))annotSessions.set(key,{strokes:[],undo:[],redo:[]});
    annotSession=annotSessions.get(key);annotStrokes=annotSession.strokes;
    cv().width=image.naturalWidth;cv().height=image.naturalHeight;annotRedraw();
  }
  if(provOpen){provState=null;provRel='';provSync();}
}
function lbVersionsPoll(){
  const h=lbHistory;if(!h.rel||h.busy||document.hidden||!lb().classList.contains('show'))return lbVersionReady;
  h.busy=true;
  lbVersionReady=(async()=>{
    try{
      const response=await fetch('/figure-versions?path='+encodeURIComponent(h.rel),{method:'POST',cache:'no-store'});
      if(!response.ok)throw new Error('versions');
      const data=await response.json();if(h!==lbHistory)return;
      if(!Array.isArray(data.versions)||!data.versions.length)throw new Error('versions');
      h.rows=data.versions;lbVersionsPaint();
      if(h.follow)await lbVersionDisplay(h.rows.at(-1).version,true);
    }catch{
      if(h===lbHistory){const b=(document.getElementById('lbVersionCurrent') as HTMLButtonElement);b.title='Historique indisponible — nouvelle tentative automatique';if(h.selected==null)b.textContent='v?';}
    }finally{h.busy=false;}
  })();
  return lbVersionReady;
}
async function lbVersionNavigate(direction: number){
  const h=lbHistory,idx=h.rows.findIndex(r=>r.version===h.selected);
  const row=direction===0?h.rows.at(-1):h.rows[idx+direction];if(!row)return;
  if(annotBusy||annotDrag||annotCur||(document.getElementById('annotNote') as HTMLDivElement).style.display==='block')return;
  h.display=(h.display||0)+1;
  const follow=h.follow;
  h.follow=direction===0||row===h.rows.at(-1);
  await lbVersionDisplay(row.version);
  if(h===lbHistory&&h.selected!==row.version)h.follow=follow;
  lbVersionsPaint();
}
(document.getElementById('lbVersionPrev') as HTMLButtonElement).onclick=e=>{e.stopPropagation();void lbVersionNavigate(-1);};
(document.getElementById('lbVersionNext') as HTMLButtonElement).onclick=e=>{e.stopPropagation();void lbVersionNavigate(1);};
(document.getElementById('lbVersionCurrent') as HTMLButtonElement).onclick=e=>{e.stopPropagation();void lbVersionNavigate(0);};
setInterval(()=>void lbVersionsPoll(),2500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void lbVersionsPoll();});
// Fiche ⓘ : ouverture au clic, fermeture au clic dehors ou Échap ; le nom
// reste en infobulle sur ⓘ pour ne pas avoir à l'ouvrir.
const lbInfoBtn=(document.getElementById('lbInfoBtn') as HTMLButtonElement);
function lbSheetToggle(open?: boolean){
  const next=open===undefined?lbSheet.hidden:open;
  lbSheet.hidden=!next;lbInfoBtn.setAttribute('aria-expanded',String(next));lbInfoBtn.classList.toggle('on',!!next);
}
lbInfoBtn.onclick=(e)=>{e.stopPropagation();lbSheetToggle();};
lbSheet.addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{if(!lbSheet.hidden)lbSheetToggle(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!lbSheet.hidden){e.stopPropagation();lbSheetToggle(false);}},true);
(document.getElementById('lbCopyPath') as HTMLButtonElement).onclick=async()=>{const f=lbList[lbIdx];if(!f)return;try{await navigator.clipboard.writeText('__ROOT__/'+f.rel);lbNameToast('Chemin copié');}catch{lbNameToast('Copie impossible');}};
// Nom en fondu 1,5 s à chaque changement de figure : on sait laquelle est
// affichée en feuilletant, sans ouvrir la fiche.
let lbToastTimer: ReturnType<typeof setTimeout> | number=0;
function lbNameToast(name: string){
  const t=(document.getElementById('lbNameToast') as HTMLDivElement);t.textContent=name;t.classList.add('show');
  clearTimeout(lbToastTimer);lbToastTimer=setTimeout(()=>t.classList.remove('show'),1500);
}
function lbVersionContext(){
  const row=lbHistory.rows.find(r=>r.version===lbHistory.selected);
  return row?'Figure source : __ROOT__/'+lbHistory.rel+'\nVersion affichée : v'+row.version+' (SHA-256 '+row.hash+'). La pièce jointe correspond à cette version ; le fichier source peut avoir changé.':'';
}
async function lbAttachDisplayed(){
  const f=lbList[lbIdx],context=lbVersionContext();
  if(!context)return postChatAttachment(f.rel);
  const img=(document.getElementById('lbImg') as HTMLImageElement),canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);
  const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,dataURL:canvas.toDataURL('image/png'),embed:true,direct:false,previewOnly:true,notes:[]})});
  if(!r.ok)throw new Error('save '+r.status);
  const j=await r.json();if(!j.path)throw new Error('snapshot missing');
  await postChatPayload({path:j.path,name:f.name,text:context,previewUrl:new URL(j.path,location.origin+'/').href});
}
(document.getElementById('lbAdd') as HTMLButtonElement).onclick=async()=>{if(annotBusy)return;document.querySelector<HTMLButtonElement>('#annotNote .annot-close').click();if(lb().classList.contains('annot')&&annotStrokes.some(s=>s.note?.trim()))(document.getElementById('annotPillSend') as HTMLButtonElement).click();else if(EMB){try{annotBusy=true;await lbAttachDisplayed();}catch{(document.getElementById('lbAdd') as HTMLButtonElement).title='Ajout impossible — réessayer';}finally{annotBusy=false;}}};

const cv=()=>(document.getElementById('annotCv') as HTMLCanvasElement);
const annotGeometryReady=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/.fig_thumbs/figure_annotation_geometry.js?v=__VER__';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
const annotGeometry=()=>globalThis.FigureAnnotationGeometry;
function annotRemember(){if(annotSession)annotSession.strokes=annotStrokes;}
function annotCheckpoint(){if(!annotSession)return;annotSession.undo.push(structuredClone(annotStrokes));annotSession.redo=[];}
function annotHistory(redo=false){
  if(!annotSession||annotBusy)return;
  const from=redo?annotSession.redo:annotSession.undo,to=redo?annotSession.undo:annotSession.redo;
  if(!from.length)return;to.push(structuredClone(annotStrokes));annotStrokes=from.pop();annotSelected=null;
  (document.getElementById('annotNote') as HTMLDivElement).style.display='none';annotRenumber();annotRedraw();
}
async function annotGuard(){if(annotBusy)return false;(document.getElementById('annotNote') as HTMLDivElement).querySelector<HTMLButtonElement>('.annot-close').click();annotRemember();(document.getElementById('annotNote') as HTMLDivElement).style.display='none';(document.getElementById('annotList') as HTMLDivElement).hidden=true;return true;}
async function annotToggle(){
  const history=lbHistory,index=lbIdx;
  await annotGeometryReady;
  if(lbHistory.rel===lbList[lbIdx]?.rel&&lbHistory.selected==null&&lbHistory.busy)await lbVersionReady;
  if(history!==lbHistory||index!==lbIdx||!lb().classList.contains('show'))return;
  if(annotBusy)return;
  (document.getElementById('annotNote') as HTMLDivElement).querySelector<HTMLButtonElement>('.annot-close').click();
  const on=lb().classList.toggle('annot');
  (document.getElementById('lbAnnot') as HTMLButtonElement).setAttribute('aria-pressed',String(on));
  if(on){
    const img=(document.getElementById('lbImg') as HTMLImageElement);if(!img.naturalWidth){lb().classList.remove('annot');return;}
    const rel=lbAnnotationKey();
    if(!annotSessions.has(rel))annotSessions.set(rel,{strokes:[],undo:[],redo:[]});
    annotSession=annotSessions.get(rel);annotStrokes=annotSession.strokes;annotCur=null;annotSelected=null;
    cv().width=img.naturalWidth;cv().height=img.naturalHeight;lbFitImage();annotRedraw();
  }else{annotRemember();(document.getElementById('annotNote') as HTMLDivElement).style.display='none';(document.getElementById('annotList') as HTMLDivElement).hidden=true;}
}
function annotPos(e: PointerEvent){const c=cv(),r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}
function annotPillUpdate(){
  const n=annotStrokes.length;
  (document.getElementById('annotPillN') as HTMLButtonElement).textContent=n+(n>1?' annotations':' annotation');
  (document.getElementById('annotPill') as HTMLDivElement).classList.toggle('on',n>0);
  (document.getElementById('annotPillSend') as HTMLButtonElement).disabled=annotBusy||!annotStrokes.some(s=>s.note?.trim());
  (document.getElementById('lbAdd') as HTMLButtonElement).disabled=annotBusy||(!EMB&&!annotStrokes.some(s=>s.note?.trim()));
  (document.getElementById('annotUndo') as HTMLButtonElement).disabled=!annotSession?.undo.length;
  (document.getElementById('annotRedo') as HTMLButtonElement).disabled=!annotSession?.redo.length;
  annotRemember();annotListRender();
}
function annotListRender(){
  const list=(document.getElementById('annotItems') as HTMLDivElement);list.replaceChildren();
  annotStrokes.forEach(s=>{const b=document.createElement('button');b.className='annot-row';b.textContent=s.n+'  '+(s.note||'Commentaire à compléter');b.onclick=()=>{(document.getElementById('annotList') as HTMLDivElement).hidden=true;(document.getElementById('annotPillN') as HTMLButtonElement).setAttribute('aria-expanded','false');annotSelected=s;annotRedraw();const r=cv().getBoundingClientRect();const p=badgeAnchor(s);annotAskNote(s,r.left+p.bx*r.width/cv().width,r.top+p.by*r.height/cv().height);};list.appendChild(b);});
}
function annotRenumber(){annotStrokes.forEach((s,i)=>s.n=i+1);annotRemember();}
async function annotAskNote(stroke: FigureStroke,clientX: number,clientY: number){
  annotSelected=stroke;
  const box=(document.getElementById('annotNote') as HTMLDivElement),inp=box.querySelector<HTMLTextAreaElement>('textarea');
  box.querySelector<HTMLSpanElement>('.annot-number').textContent=String(stroke.n);
  inp.value=stroke.note||'';box.style.display='block';
  const position=()=>{const host=lb().getBoundingClientRect();box.style.maxWidth=Math.max(120,host.width-16)+'px';box.style.left=Math.max(host.left+8,Math.min(clientX+18,host.right-box.offsetWidth-8))+'px';box.style.top=Math.max(host.top+8,Math.min(clientY-24,host.bottom-box.offsetHeight-8))+'px';};
  const save=()=>{if(inp.value!==stroke.note){annotCheckpoint();stroke.note=inp.value.trim();}annotSent=false;annotRedraw();};
  const close=()=>{if(annotBusy)return;save();if(!stroke.note){annotStrokes=annotStrokes.filter(s=>s!==stroke);annotSelected=null;annotRenumber();}box.style.display='none';box.querySelector<HTMLButtonElement>('.annot-close').onclick=null;annotRedraw();};
  box.querySelector<HTMLButtonElement>('.annot-close').onclick=close;
  box.querySelector<HTMLButtonElement>('.annot-delete').onclick=()=>{if(annotBusy)return;annotCheckpoint();annotStrokes=annotStrokes.filter(s=>s!==stroke);annotSelected=null;annotRenumber();box.style.display='none';annotRedraw();};
  for(const selector of ['.annot-draft','.annot-send'])box.querySelector<HTMLButtonElement>(selector).onclick=async function(this:HTMLButtonElement){
    if(annotBusy||this.disabled)return;save();if(!stroke.note)return;
    annotBusy=true;inp.disabled=true;annotPillUpdate();inp.oninput(undefined);
    try{await annotSendOne(stroke,selector==='.annot-send');box.style.display='none';}
    catch(error){box.querySelector<HTMLSpanElement>('.annot-status').textContent='Envoi impossible — réessayer';}
    finally{annotBusy=false;inp.disabled=false;annotPillUpdate();inp.oninput(undefined);}
  };
  inp.oninput=()=>{inp.style.height='44px';inp.style.height=Math.min(132,inp.scrollHeight)+'px';for(const sel of ['.annot-send','.annot-draft'])(box.querySelector(sel) as HTMLInputElement).disabled=annotBusy||!inp.value.trim();position();};
  inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();box.querySelector<HTMLButtonElement>('.annot-send').click();}};
  box.querySelector<HTMLSpanElement>('.annot-status').textContent='';inp.oninput(undefined);inp.focus();annotRedraw();
}
function annotBindCanvas(){
  const c=cv(),stage=(document.getElementById('lbViewport') as HTMLDivElement),wrap=(document.getElementById('lbWrap') as HTMLDivElement);
  let pan=null;
  stage.addEventListener('pointerdown',e=>{
    if(!lb().classList.contains('annot')||annotTool!=='pan'||annotBusy||e.button!==0)return;
    document.querySelector<HTMLButtonElement>('#annotNote .annot-close').click();
    pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop,px:lbPanX,py:lbPanY};
    stage.setPointerCapture(e.pointerId);stage.style.cursor='grabbing';e.preventDefault();e.stopPropagation();
  },true);
  stage.addEventListener('pointermove',e=>{
    if(!pan||pan.id!==e.pointerId)return;
    const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
    const mx=Math.max(0,(stage.clientWidth-wrap.offsetWidth)/2-24),my=Math.max(0,(stage.clientHeight-wrap.offsetHeight)/2-24);
    lbPanX=Math.max(-mx,Math.min(mx,pan.px+dx));lbPanY=Math.max(-my,Math.min(my,pan.py+dy));
    if(!mx)stage.scrollLeft=pan.left-dx;if(!my)stage.scrollTop=pan.top-dy;
    wrap.style.transform=`translate(${lbPanX}px,${lbPanY}px)`;e.stopPropagation();
  },true);
  const endPan=(e)=>{if(!pan||pan.id!==e.pointerId)return;pan=null;stage.style.cursor='grab';if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);e.stopPropagation();};
  stage.addEventListener('pointerup',endPan,true);stage.addEventListener('pointercancel',endPan,true);

  c.addEventListener('pointerdown',e=>{
    if(e.button!==0||annotBusy)return;
    const p=annotPos(e),g=annotGeometry(),tol=8*c.width/c.getBoundingClientRect().width;
    (document.getElementById('annotNote') as HTMLDivElement).querySelector<HTMLButtonElement>('.annot-close').click();
    if(annotTool==='pan'){const stage=(document.getElementById('lbViewport') as HTMLDivElement);annotDrag={kind:'pan',x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};}
    else{
      // Plus d'outil « sélectionner » (Thierry 2026-09-11) : une annotation
      // existante se saisit par son numéro ou par son BORD (pas son aire, pour
      // pouvoir dessiner une forme à l'intérieur d'une autre) ; ailleurs on crée.
      const handle=annotSelected&&Math.hypot(p.x-annotSelected.x2,p.y-annotSelected.y2)<tol;
      const hit=handle?annotSelected:badgeHit(p)||[...annotStrokes].reverse().find(s=>annotEdgeHit(g,s,p,tol));
      if(hit){annotSelected=hit;annotDrag={kind:handle?'resize':'move',stroke:hit,original:{...hit},p,changed:false};}
      else{annotSelected=null;annotCur={tool:annotTool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:'#d88653'};annotDrag={kind:'create',p};}
    }
    c.setPointerCapture(e.pointerId);annotRedraw();
  });
  c.addEventListener('pointermove',e=>{
    if(!annotDrag)return;const d=annotDrag,p=annotPos(e),g=annotGeometry();
    if(d.kind==='pan'){const stage=(document.getElementById('lbViewport') as HTMLDivElement);stage.scrollLeft=d.left-e.clientX+d.x;stage.scrollTop=d.top-e.clientY+d.y;return;}
    if(d.kind==='create')annotCur=g.resize(annotCur,p,c.width,c.height);
    else{if(!d.changed&&Math.hypot(p.x-d.p.x,p.y-d.p.y)>2){annotCheckpoint();d.changed=true;}if(d.changed)Object.assign(d.stroke,d.kind==='resize'?g.resize(d.original,p,c.width,c.height):g.move(d.original,p.x-d.p.x,p.y-d.p.y,c.width,c.height));}
    annotRedraw();
  });
  c.addEventListener('pointerup',e=>{
    if(!annotDrag)return;const d=annotDrag;annotDrag=null;
    if(d.kind==='create'){const s=annotGeometry().create(annotCur.tool,{x:annotCur.x1,y:annotCur.y1},{x:annotCur.x2,y:annotCur.y2},c.width,c.height);annotCur=null;if(s){annotCheckpoint();s.id=crypto.randomUUID();s.color='#d88653';annotStrokes.push(s);annotRenumber();annotAskNote(s,e.clientX,e.clientY);}}
    else if(d.kind!=='pan'){
      if(d.kind==='resize'&&!annotGeometry().create(d.stroke.tool,{x:d.stroke.x1,y:d.stroke.y1},{x:d.stroke.x2,y:d.stroke.y2},c.width,c.height))Object.assign(d.stroke,d.original);
      if(!d.changed)annotAskNote(d.stroke,e.clientX,e.clientY);
    }
    annotRedraw();
  });
  c.addEventListener('pointercancel',()=>{if(annotDrag?.original)Object.assign(annotDrag.stroke,annotDrag.original);annotDrag=null;annotCur=null;annotRedraw();});
  // Les outils sont toujours dans la barre (Thierry 2026-09-11) : un clic sur
  // l'un d'eux entre en mode annotation s'il ne l'est pas déjà.
  document.querySelectorAll<HTMLElement>('#annotBar [data-tool]').forEach(b=>b.onclick=async()=>{if(annotBusy)return;if(!lb().classList.contains('annot')){await annotToggle();if(!lb().classList.contains('annot'))return;}annotTool=b.dataset.tool;const shapes=(document.getElementById('annotShapes') as HTMLDetailsElement);if(b.closest<HTMLElement>('#annotShapes')){shapes.querySelector<SVGSVGElement>('summary svg').replaceWith(b.querySelector<SVGSVGElement>('svg').cloneNode(true));shapes.querySelector<HTMLElement>('summary').title='Forme : '+b.title;shapes.open=false;}document.querySelectorAll<HTMLElement>('#annotBar [data-tool]').forEach(o=>{o.classList.toggle('sel',o===b);o.setAttribute('aria-pressed',String(o===b));});stage.style.cursor=annotTool==='pan'?'grab':'';c.style.cursor=annotTool==='pan'?'grab':'crosshair';});
  (document.getElementById('annotUndo') as HTMLButtonElement).onclick=()=>annotHistory();(document.getElementById('annotRedo') as HTMLButtonElement).onclick=()=>annotHistory(true);
  (document.getElementById('annotZoomOut') as HTMLButtonElement).onclick=()=>lbSetZoom(lbZoomLevel/1.5);(document.getElementById('annotZoomIn') as HTMLButtonElement).onclick=()=>lbSetZoom(lbZoomLevel*1.5);(document.getElementById('annotFit') as HTMLButtonElement).onclick=()=>lbSetZoom(1);
  (document.getElementById('annotPillN') as HTMLButtonElement).onclick=function(){(document.getElementById('annotNote') as HTMLDivElement).querySelector<HTMLButtonElement>('.annot-close').click();const list=(document.getElementById('annotList') as HTMLDivElement);list.hidden=!list.hidden;(this as HTMLButtonElement).setAttribute('aria-expanded',String(!list.hidden));};
  document.addEventListener('pointerdown',e=>{if(!(e.target as Element).closest<HTMLDivElement>('#annotList,#annotPillN')){(document.getElementById('annotList') as HTMLDivElement).hidden=true;(document.getElementById('annotPillN') as HTMLButtonElement).setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!(document.getElementById('annotList') as HTMLDivElement).hidden){e.preventDefault();e.stopImmediatePropagation();(document.getElementById('annotListClose') as HTMLButtonElement).click();}},true);
  (document.getElementById('annotListClose') as HTMLButtonElement).onclick=()=>{(document.getElementById('annotList') as HTMLDivElement).hidden=true;(document.getElementById('annotPillN') as HTMLButtonElement).setAttribute('aria-expanded','false');};
}

function annotRedraw(exportOnly=null){
  const c=cv(), x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height);
  const lw=Math.max(2,c.width/300);          // badge scale (unchanged)
  const sw=Math.max(1.4,lw*0.65);            // subtle stroke for the marks themselves
  for(const s of (exportOnly||annotStrokes.concat(annotCur?[annotCur]:[]))){
    x.strokeStyle=s.color; x.fillStyle=s.color; x.lineWidth=sw; x.lineCap='round'; x.lineJoin='round';
    if(s.tool==='pen'){
      x.beginPath(); s.pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)); x.stroke();
    }else if(s.tool==='ellipse'){
      x.save(); x.setLineDash([sw*4,sw*3.2]);
      x.beginPath();
      x.ellipse((s.x1+s.x2)/2,(s.y1+s.y2)/2,Math.abs(s.x2-s.x1)/2||1,Math.abs(s.y2-s.y1)/2||1,0,0,2*Math.PI);
      x.stroke(); x.restore();
    }else if(s.tool==='rect'){
      x.save(); x.setLineDash([sw*4,sw*3.2]);
      x.strokeRect(s.x1,s.y1,s.x2-s.x1,s.y2-s.y1);
      x.restore();
    }else if(s.tool==='arrow'){
      x.beginPath(); x.moveTo(s.x1,s.y1); x.lineTo(s.x2,s.y2); x.stroke();
      const a=Math.atan2(s.y2-s.y1,s.x2-s.x1), h=sw*7;
      x.beginPath(); x.moveTo(s.x2,s.y2);
      x.lineTo(s.x2-h*Math.cos(a-0.45),s.y2-h*Math.sin(a-0.45));
      x.lineTo(s.x2-h*Math.cos(a+0.45),s.y2-h*Math.sin(a+0.45));
      x.closePath(); x.fill();
    }else if(s.tool==='text'){
      x.font=`${lw*5}px -apple-system,sans-serif`;
      x.fillText(s.txt,s.x,s.y);
    }
    if(s.n){
      const {bx,by}=badgeAnchor(s);
      const r=lw*3.2;
      x.beginPath();x.arc(bx,by-r*1.2,r,0,7);x.fillStyle=s.color;x.fill();
      x.fillStyle='#fff';x.font=`600 ${r*1.2}px -apple-system,sans-serif`;
      x.textAlign='center';x.textBaseline='middle';
      x.fillText(s.n,bx,by-r*1.2);
      x.textAlign='start';x.textBaseline='alphabetic';
    }
  }
  if(!exportOnly&&annotSelected&&annotStrokes.includes(annotSelected)){const s=annotSelected,r=Math.max(3,c.width/c.getBoundingClientRect().width*4);x.fillStyle='#e77f3e';x.fillRect(s.x2-r,s.y2-r,r*2,r*2);}
  if(!exportOnly)annotPillUpdate();
}
function badgeAnchor(s){
  if(s.tool==='ellipse') return {bx:(s.x1+s.x2)/2, by:Math.min(s.y1,s.y2)};
  if(s.tool==='rect') return {bx:Math.min(s.x1,s.x2), by:Math.min(s.y1,s.y2)};
  if(s.tool==='arrow') return {bx:s.x1, by:s.y1};
  if(s.tool==='pen') return {bx:s.pts[0].x, by:s.pts[0].y};
  return {bx:s.x, by:s.y};
}
function annotEdgeHit(g,s,p,tol: number){
  if(!g.hit(s,p,tol))return false;
  const k=s.tool||s.type;if(k==='arrow')return true;
  const b=g.bounds(s);if(b.width<=2*tol||b.height<=2*tol)return true;
  if(k==='ellipse'){const rx=b.width/2-tol,ry=b.height/2-tol;return !(((p.x-b.x-b.width/2)/rx)**2+((p.y-b.y-b.height/2)/ry)**2<1);}
  return !(p.x>b.x+tol&&p.x<b.x+b.width-tol&&p.y>b.y+tol&&p.y<b.y+b.height-tol);
}
function badgeHit(p){
  const c=cv(), lw=Math.max(2,c.width/300), r=lw*3.2;
  for(const s of annotStrokes){
    if(!s.n) continue;
    const {bx,by}=badgeAnchor(s);
    if(Math.hypot(p.x-bx, p.y-(by-r*1.2)) <= r*1.6) return s;
  }
  return null;
}
function annotInit(){
  annotBindCanvas();
  const ANNOT_EMBEDDED=EMB;
  if(ANNOT_EMBEDDED){
    // fichiers html : ouvrir en onglet Studio (target=_blank ne marche pas en iframe)
    document.addEventListener('click', function(e){
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[target="_blank"]');
      if(!a) return;
      const href = a.getAttribute('href') || '';
      if(/\.html?(\?|$)/i.test(href)){
        e.preventDefault();
        __atelierPost({type:'atelier-open-tab', url:'/'+href.replace(/^\//,''),
          title:(href.split('/').pop()||'page').split('?')[0]});
      }
    }, true);
  }
  if(ANNOT_EMBEDDED){
    // Commandes structurées chat → Galerie. Le nonce est partagé avec l'app
    // hôte et le contrat pur recoupe chaque chemin avec le catalogue courant.
    window.addEventListener('message', async function(e){
      if(e.source!==window.top || !e.data || e.data.type!=='atelier-gallery-command') return;
      const nonce=sessionStorage.getItem('atelier_nonce')||'';
      if(!nonce || e.data.nonce!==nonce) return;
      const contract=await galleryCommandsReady; if(!contract) return;
      const knownRels=e.data.action==='compare'
        ? FILES.filter(f=>imgExt(f.ext)).map(f=>f.rel)
        : FILES.map(f=>f.rel);
      const commandAdapter={
        projectRoot:'__ROOT__',
        show(rels){
          cmpClose();
          chatFocusRels=new Set(rels);
          selSet.clear(); rels.forEach((rel)=>selSet.add(rel));
          lastSelRel=rels[rels.length-1]||null;
          updateDelBtn(); render();
          const first=document.querySelector<HTMLDivElement>('.card');
          if(first) first.scrollIntoView({block:'start',behavior:'smooth'});
        },
        open(rel){
          cmpClose();
          lbOpenAny(rel);
        },
        compare(rels){
          chatFocusRels=new Set(rels);
          selSet.clear(); rels.forEach((rel)=>selSet.add(rel));
          lastSelRel=rels[rels.length-1]||null;
          updateDelBtn(); render(); openCompare();
        },
        reset(){
          chatFocusRels.clear();
          selSet.clear(); lastSelRel=null;
          cmpClose(); updateDelBtn(); render();
        }
      };
      const result=await contract.executeWithRefresh(e.data, knownRels, commandAdapter, async()=>{
        const scan=await fetch('/rescan',{method:'POST'}).then(r=>r.json());
        if(!scan || !scan.ok) return null;
        const data=await fetch('/data',{cache:'no-store'}).then(r=>r.ok?r.json():null);
        if(!data || !Array.isArray(data.files)) return null;
        applyGalleryData(data);
        return e.data.action==='compare'
          ? FILES.filter(f=>imgExt(f.ext)).map(f=>f.rel)
          : FILES.map(f=>f.rel);
      });
      __atelierPost(Object.assign({type:'atelier-gallery-result'}, result));
    });
    // thème dynamique poussé par Studio (variables mappées sur celles de la galerie)
    window.addEventListener('message', function(e){
      if(!e.data || e.data.type !== 'atelier-theme') return;
      var v = e.data.vars || {};
      var map = {'--bg':'--bg','--bg-card':'--card','--bg-ctl':'--card2','--fg':'--txt',
        '--muted':'--muted','--muted2':'--faint','--border':'--border',
        '--border2':'--border-strong','--accent':'--primary'};
      for(var k in map){ if(v[k]) document.documentElement.style.setProperty(map[k], v[k]); }
      // Rôles canoniques du shell (4 gris, surcouche, focus, statuts) : repris
      // tels quels, pour que l'infobulle et les anneaux de focus de la galerie
      // soient ceux de l'app. Liste fermée : --accent a un autre sens ici.
      ['--text-primary','--text-secondary','--text-muted','--text-disabled','--surface-overlay',
        '--elevation-overlay','--focus-ring-color','--focus-ring-width','--focus-ring-offset',
        '--status-success','--status-warning','--status-error','--font-chrome']
        .forEach(function(name){ if(v[name]) document.documentElement.style.setProperty(name, v[name]); });
      // WKWebView dessine la piste native de scrollbar selon color-scheme,
      // indépendamment du fond CSS de l'iframe. Les presets Atelier sont hex.
      if(/^#[0-9a-f]{6}$/i.test(v['--bg']||'')){
        var c=v['--bg'].slice(1), r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16);
        document.documentElement.style.colorScheme=((r*299+g*587+b*114)/1000>150)?'light':'dark';
      }
      if(v['--ui-font']) document.documentElement.style.setProperty('--ui-font', v['--ui-font']);
      if(v['--code-font']) document.documentElement.style.setProperty('--code-font', v['--code-font']);
    });
    __atelierPost({type:'atelier-theme-request'});
  }
  if(ANNOT_EMBEDDED){const st=document.createElement('style');st.textContent='.embOnly{display:inline-flex !important} .embHide{display:none !important}'
      +':root{--bg:#1e2124;--card:#24282d;--card2:#2c2f34;--txt:#dadee3;--muted:#90969d;--faint:#62666c;--border:#2a2d31;--border-strong:#43474c;--primary:#e77f3e;--primary-soft:color-mix(in srgb,var(--primary) 16%,transparent);--elev:0 4px 18px rgba(0,0,0,.28),0 1px 4px rgba(0,0,0,.18);--hot:#e06c75}'
      +'body{font-family:var(--ui-font)}';document.head.appendChild(st);}
  function annotRender(maxW: number){
    const img=(document.getElementById('lbImg') as HTMLImageElement);
    const scale=Math.min(1, maxW/img.naturalWidth);
    const out=document.createElement('canvas');
    out.width=Math.round(img.naturalWidth*scale); out.height=Math.round(img.naturalHeight*scale);
    const x=out.getContext('2d');
    x.drawImage(img,0,0,out.width,out.height); x.drawImage(cv(),0,0,out.width,out.height);
    return out.toDataURL('image/png');
  }
  const pendingFigureNotes=new Map();
  window.addEventListener('message',event=>{
    const d=event.data;
    if(event.source!==window.top || d?.type!=='atelier-pdf-annotation-consumed' || d.nonce!==window.__atelierNonce)return;
    const pending=pendingFigureNotes.get(d.id);if(!pending || pending.rel!==d.rel)return;
    pending.session.strokes=pending.session.strokes.filter((s)=>!pending.notes.some((a)=>a.stroke.id===s.id && a.note===s.note && ['x1','y1','x2','y2','tool'].every(k=>a.stroke[k]===s[k])));
    pending.session.undo=[];pending.session.redo=[];
    if(annotSession===pending.session){annotStrokes=pending.session.strokes;annotSelected=null;annotRenumber();annotRedraw();}
    pendingFigureNotes.delete(d.id);
  });
  async function annotPost(direct: boolean,only=null){
    const f=lbList[lbIdx];
    const versionContext=lbVersionContext();
    const sentSession=annotSession;
    const sentNotes=(only?[only]:annotStrokes).filter(s=>s.note).map(s=>({stroke:structuredClone(s),note:s.note,n:s.n}));
    const body=(dataURL: string)=>JSON.stringify({name:f.name,dataURL,direct:!!direct,sourceContext:versionContext,
        target:claudeTarget(),embed:ANNOT_EMBEDDED,
        notes:sentNotes.map(s=>({n:s.n,text:s.note}))});
    annotRedraw(sentNotes.map(s=>s.stroke));
    const imageLarge=annotRender(2200), imageSmall=annotRender(1400);annotRedraw();
    let r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:body(imageLarge)});
    // 413 : une carte dense à 2 200 px dépasse la limite de corps d'un serveur
    // plus ancien (vécu 2026-09-04, fig1 = 3,1 Mo en base64). On rejoue une
    // fois à 1 400 px — la vignette et l'agent n'ont pas besoin de plus.
    if(r.status===413) r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:body(imageSmall)});
    if(!r.ok){ const e=new Error('save '+r.status) as Error & {status:number}; e.status=r.status; throw e; }
    const j=await r.json();
    // Même contrat que le bouton « Chat » d'une carte : sans ACK de l'hôte le
    // message se perd en silence (nonce périmé, hôte pas encore à l'écoute) et
    // la pilule mentait avec « Added to chat ✓ ». On attend l'accusé réel.
    // Chemin + figure source + vignette (même contrat qu'annot_kit.js) : sans
    // eux le chat n'affichait que le nom du fichier généré, horodaté, au-dessus
    // d'une bulle vide (2026-09-04). Le contrat IPC accepte déjà ces champs.
    if(ANNOT_EMBEDDED&&j&&j.message){
      const id=crypto.randomUUID(), rel='figure-comments:'+String(f.rel||f.name);
      pendingFigureNotes.set(id,{rel,notes:sentNotes,session:sentSession});
      const base: {text:string;direct:boolean;pdfAnnotation:{rel:string;id:string};path?:string;name?:string;previewUrl?:string}={text:j.message,direct:!!direct,pdfAnnotation:{rel,id}};
      if(j.path){
        base.path=j.path;
        const source=String(f.name||f.rel||'').split('/').pop();
        if(source) base.name=source;
        try{ base.previewUrl=new URL(j.path, location.origin+'/').href; }catch(e){ /* sans vignette */ }
      }
      await postChatPayload(base);
    }
    return j;
  }
  annotSendOne=async (stroke,direct=true)=>{const session=annotSession;await annotPost(direct,stroke);if(!ANNOT_EMBEDDED){session.strokes=session.strokes.filter((s)=>s!==stroke);if(session===annotSession){annotStrokes=session.strokes;annotRenumber();annotRedraw();}}};
  (document.getElementById('annotPillCancel') as HTMLButtonElement).onclick=async function(){
    const n=annotStrokes.filter(s=>s.note).length;
    if(!(await confirmDialog(n>1?`Supprimer les ${n} commentaires ?`:'Supprimer le commentaire ?','Supprimer')))return;
    annotStrokes=[]; annotSent=true;
    (document.getElementById('annotNote') as HTMLDivElement).style.display='none';
    annotRedraw();
  };
  function claudeTarget(){
    try{ return JSON.parse(localStorage.getItem('claudeTargetV1')||'null'); }catch(e){ return null; }
  }
  (function(){
    const btn=(document.getElementById('annotPillTarget') as HTMLButtonElement), menu=(document.getElementById('tgMenu') as HTMLDivElement);
    if(ANNOT_EMBEDDED)btn.style.display='none';
    const mark=()=>btn.classList.toggle('set', !!claudeTarget());
    mark();
    btn.onclick=async e=>{
      e.stopPropagation();
      const cur=claudeTarget();
      let html='<div class="hd">Envoyer vers</div>'
        +'<div class="it'+(cur?'':' on')+'" data-i="-1"><span class="app">auto</span><span class="t">Session du projet (auto)</span></div>';
      try{
        const j=await (await fetch('/claude-targets')).json();
        (j.targets||[]).forEach((t,i: string)=>{
          const on=cur&&cur.app===t.app&&cur.id===t.id;
          html+='<div class="it'+(on?' on':'')+'" data-i="'+i+'"><span class="app">'+t.app+'</span><span class="t">'
            +esc(t.title||t.id)+(t.inProject?'':' — '+esc(String(t.cwd||'').split('/').pop()))+'</span></div>';
        });
        menu.innerHTML=html;
        const r=btn.getBoundingClientRect();
        menu.style.display='flex';
        menu.style.left=Math.max(8, r.left-120)+'px';
        menu.style.top=Math.max(8, r.top-menu.offsetHeight-10)+'px';
        menu.querySelectorAll<HTMLDivElement>('.it').forEach(it=>{
          it.onclick=(ev)=>{
            ev.stopPropagation();
            const i=+it.dataset.i;
            if(i<0) localStorage.removeItem('claudeTargetV1');
            else localStorage.setItem('claudeTargetV1', JSON.stringify({app:j.targets[i].app,id:j.targets[i].id,title:j.targets[i].title}));
            mark(); menu.style.display='none';
          };
        });
        document.addEventListener('click',function h(){menu.style.display='none';document.removeEventListener('click',h);});
      }catch(err){ console.warn('claude-targets failed', err); }
    };
  })();
  (document.getElementById('annotPillSend') as HTMLButtonElement).onclick=async function(){
    const lbl=(document.getElementById('annotPillN') as HTMLButtonElement);
    if((this as HTMLInputElement).disabled||annotBusy)return;annotBusy=true;(this as HTMLInputElement).disabled=true;const sendingSession=annotSession;
    (this as HTMLElement).classList.remove('is-ok','is-err'); (this as HTMLElement).classList.add('is-busy');
    try{
      const j=await annotPost(false);
      if(!ANNOT_EMBEDDED){sendingSession.strokes=[];if(annotSession===sendingSession)annotStrokes=[];}annotSent=true;
      (document.getElementById('annotNote') as HTMLDivElement).style.display='none';
      if(!ANNOT_EMBEDDED)lb().classList.remove('annot');annotRedraw();
      (this as HTMLElement).classList.remove('is-busy'); (this as HTMLElement).classList.add('is-ok');
      lbl.textContent=ANNOT_EMBEDDED?'Added to chat ✓':(j.submitted?'Sent to session ✓':'Pasted into Claude ✓');
    }catch(e){
      // Les marques restent en place : un nouveau clic sur la flèche rejoue l'envoi.
      (this as HTMLElement).classList.remove('is-busy'); (this as HTMLElement).classList.add('is-err');
      // Trois échecs distincts, trois messages : l'ACK du chat, une réponse
      // HTTP du serveur (413 = image trop lourde), ou pas de serveur du tout.
      // « Serveur off » sur un 413 envoyait chercher un serveur qui tournait.
      lbl.textContent=/ack/.test(String(e&&e.message))
        ? 'Chat injoignable — réessayer'
        : e&&e.status===413 ? 'Image trop lourde — serveur à relancer'
        : e&&e.status ? 'Erreur serveur '+e.status
        : 'Serveur off — démarrer le serveur';
    }
    annotBusy=false;(this as HTMLInputElement).disabled=false;setTimeout(()=>{(this as HTMLElement).classList.remove('is-busy','is-ok','is-err'); annotPillUpdate();},2400);
  };
}
annotInit();
function lbOpen(rel){const i=lbList.findIndex(f=>f.rel===rel);if(i>=0)lbShow(i);}
(document.getElementById('lbClose') as HTMLButtonElement).onclick=lbClose;
(document.getElementById('lbProv') as HTMLButtonElement).onclick=e=>{e.stopPropagation();provToggle();};
(document.getElementById('lbAnnot') as HTMLButtonElement).onclick=e=>{e.stopPropagation();annotToggle();};
(document.getElementById('lbPrev') as HTMLButtonElement).onclick=e=>{e.stopPropagation();lbNav(-1);};
(document.getElementById('lbNext') as HTMLButtonElement).onclick=e=>{e.stopPropagation();lbNav(1);};
lb().onclick=e=>{if((e.target as HTMLElement).id==='lb')lbClose();};
(document.getElementById('lbWrap') as HTMLDivElement).onclick=e=>e.stopPropagation();
(document.getElementById('lbPdf') as HTMLIFrameElement).onclick=e=>e.stopPropagation();
render();

// --- live data refresh: update cards when the gallery is rebuilt (agent edits
//     + rescans), without navigating/reloading the iframe. This preserves scroll,
//     filters, selection and the host app's visual continuity. ---
(function(){
  let boot = null;
  const getRev = () => fetch('/rev').then(r => r.json()).then(j => j.rev).catch(() => null);
  getRev().then(r => { boot = r; });
  async function checkRev(){
    if(boot == null){ boot = await getRev(); return; }
    const lb = (document.getElementById('lb') as HTMLDivElement);
    if(lb && lb.classList.contains('show')) return;        // a viewer/lightbox is open
    const sel = window.getSelection && window.getSelection();
    if(sel && String(sel).trim()) return;                  // user is selecting text
    const r = await getRev();
    if(r != null && r !== boot){
      const data=await fetch('/data',{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null);
      if(data){ applyGalleryData(data); boot=r; }
    }
  }
  // onglet masqué : aucune requête ; au retour, un rattrapage immédiat pour ne
  // pas afficher une galerie périmée pendant jusqu'à 2,5 s
  setInterval(() => { if (!document.hidden) checkRev(); }, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRev(); });
})();
const galleryUiAsset=(path)=>{
  const raw='/' + '.fig_thumbs/shadcn-ui/'+path+'?v=__VER__';
  return window.AtelierRuntime&&AtelierRuntime.rewriteUrl
    ? AtelierRuntime.rewriteUrl(raw)
    : raw;
};
(document.getElementById('galleryUiCss') as HTMLLinkElement).href=galleryUiAsset('gallery-ui.css');
import(galleryUiAsset('gallery-ui.js'))
  .catch(err=>console.error('[gallery-ui] React/shadcn mount failed',err));
const viewerToolbarScript=document.createElement('script');
viewerToolbarScript.src='/.fig_thumbs/gallery_viewer_toolbar.js?v=__VER__';
document.body.append(viewerToolbarScript);

/** Types shared by classic scripts and browser integration tests; erased at build. */
export type PageGlobals = {
  lbSetZoom: typeof lbSetZoom;
  lbZoomLevel: typeof lbZoomLevel;
  lbList: typeof lbList;
  lbShow: typeof lbShow;
  lb: typeof lb;
  lbHistory: typeof lbHistory;
  lbIdx: typeof lbIdx;
  lbVersionReady: typeof lbVersionReady;
  lbVersionNavigate: typeof lbVersionNavigate;
  lbVersionsPoll: typeof lbVersionsPoll;
  lbAttachDisplayed: typeof lbAttachDisplayed;
  annotToggle: typeof annotToggle;
  annotRedraw: typeof annotRedraw;
  annotGuard: typeof annotGuard;
  annotAskNote: typeof annotAskNote;
  annotRemember: typeof annotRemember;
  annotStrokes: typeof annotStrokes;
  annotBusy: typeof annotBusy;
  annotCur: typeof annotCur;
  annotDrag: typeof annotDrag;
};
