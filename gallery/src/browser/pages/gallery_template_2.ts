/* Thème de l'hôte avant la première peinture (galerie embarquée dans l'app).
   Sans ce script, chaque ouverture en thème clair peignait d'abord la palette
   sombre Default, le temps que l'app réponde à atelier-theme-request. Le
   dernier thème reçu est gardé sous la même clé que atelier_theme.js (les
   éditeurs partagent l'origine de la galerie) et réappliqué ici, dans le
   <head>. La palette Default ne sert plus que de repli sans cache. */
(function(){
  var EMBED = window.self !== window.top;
  try{ EMBED = EMBED || new URLSearchParams(location.search).get('embedded') === 'atelier'; }catch(e){}
  // html.emb dès le <head> : posée plus tard (fin du corps de page), WebKit gardait la
  // barre de la fenêtre déjà construite au premier layout, piste blanche comprise.
  if(EMBED) document.documentElement.classList.add('emb');
  var CACHE_KEY = 'atelier-theme-cache';
  // variables de l'app → variables de la galerie (--accent a un autre sens ici)
  var MAP = {'--bg':'--bg','--bg-card':'--card','--bg-ctl':'--card2','--fg':'--txt',
    '--muted':'--muted','--muted2':'--faint','--border':'--border',
    '--border2':'--border-strong','--accent':'--primary'};
  // Rôles canoniques du shell (4 gris, surcouche, focus, statuts) : repris
  // tels quels, pour que l'infobulle et les anneaux de focus de la galerie
  // soient ceux de l'app. Liste fermée.
  var ROLES = ['--text-primary','--text-secondary','--text-muted','--text-disabled','--surface-overlay',
    '--elevation-overlay','--focus-ring-color','--focus-ring-width','--focus-ring-offset',
    '--status-success','--status-warning','--status-error','--font-chrome','--ui-font','--code-font',
    // remplissage des actions (tokens.css) : jamais l'encre en fond de bouton
    '--fill-primary','--fill-primary-hover','--on-fill-primary',
    '--fill-secondary','--fill-secondary-hover','--fill-secondary-ring'];
  function apply(message: {vars?: Record<string, string>; colorScheme?: string}){
    var v = (message && message.vars) || {};
    var root = document.documentElement.style;
    for(var k in MAP){ if(typeof v[k] === 'string' && v[k]) root.setProperty(MAP[k], v[k]); }
    ROLES.forEach(function(name){ if(typeof v[name] === 'string' && v[name]) root.setProperty(name, v[name]); });
    // GAL-07 : les rouges destructifs suivent le rouge d'état du thème (lisible
    // en clair) ; la valeur Default de :root ne reste qu'en repli autonome.
    if(typeof v['--status-error'] === 'string' && v['--status-error']){
      root.setProperty('--hot', v['--status-error']); root.setProperty('--destructive', v['--status-error']);
    }
    // WKWebView dessine la piste native de scrollbar selon color-scheme,
    // indépendamment du fond CSS de l'iframe. Les presets Atelier sont hex.
    if(/^#[0-9a-f]{6}$/i.test(v['--bg'] || '')){
      var c = v['--bg'].slice(1), r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
      document.documentElement.style.colorScheme = ((r*299 + g*587 + b*114)/1000 > 150) ? 'light' : 'dark';
    } else if(message && (message.colorScheme === 'light' || message.colorScheme === 'dark')){
      document.documentElement.style.colorScheme = message.colorScheme;
    }
  }
  function remember(message: {vars?: Record<string, string>; colorScheme?: string; version?: unknown; preset?: unknown}){
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({type:'atelier-theme', vars: message.vars || {},
        colorScheme: message.colorScheme, version: message.version, preset: message.preset}));
    }catch(e){}
  }
  function applyCached(){
    if(!EMBED) return false;
    try{
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if(cached && cached.vars){ apply(cached); return true; }
    }catch(e){}
    return false;
  }
  window.__atelierGalleryTheme = {apply: apply, remember: remember, applyCached: applyCached};
  applyCached();
})();
