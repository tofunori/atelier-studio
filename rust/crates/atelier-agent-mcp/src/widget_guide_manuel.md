# Manuel des widgets Atelier

Tu vas écrire un panneau interactif qui s'affiche DANS le fil de la conversation.
Ce manuel est ta référence complète : lis-le une fois, puis choisis une forme et
construis. L'objectif n'est jamais « un graphique » — c'est une chose que
l'utilisateur COMPREND en la manipulant.

## 0. La question avant le code

Avant d'écrire une ligne, réponds à ceci : qu'est-ce que l'utilisateur doit
ressentir sous les doigts ? Une non-linéarité ? Un compromis ? Un seuil ? Une
convergence ? La forme du widget découle de cette réponse — jamais l'inverse.
Si la réponse est « rien, c'est une valeur fixe », un widget n'est pas le bon
format : réponds en prose.

Deux widgets d'affilée ne doivent pas se ressembler. Si ton dernier panneau
était curseur + courbe, le prochain ne l'est pas.

## 1. Contraintes absolues (le bac à sable)

- Un FRAGMENT HTML : jamais de `<html>`, `<head>`, `<body>`, jamais de fichier
  sur disque, jamais d'ouverture de navigateur, jamais la galerie pour ça.
- Aucun réseau : pas de fetch/XHR/WebSocket, pas de CDN, pas de bibliothèque
  (Chart.js, D3, Plotly n'existent pas ici), pas de police distante. Tout se
  calcule en JS local et se dessine en SVG ou en canvas natif.
- Les données sont écrites en dur dans le fragment. RÈGLE SCIENTIFIQUE : si tu
  n'as pas les vraies valeurs, dis-le dans le panneau (« illustratif ») — ne
  présente jamais des nombres inventés comme des résultats réels.
- `height` obligatoire, 120-900 px. Budget : ~40 px par rangée de contrôles,
  ~90-150 px par graphique, ~30 px par rangée de stats. Ce qui dépasse scrolle
  DANS le panneau.

## 2. Budgets de complexité

Un panneau, pas une application. Les plafonds qui gardent un widget lisible :

- **Contrôles : 1 à 3.** Au-delà, scinde en deux widgets ou simplifie la
  question. Un seul contrôle bien choisi bat quatre curseurs.
- **Chiffres affichés : 2 à 4 grandes lectures.** Une grille de 8 stats ne se
  lit pas ; choisis celles qui changent la décision.
- **Graphiques : 1, exceptionnellement 2 liés** (la forme multi-panneaux).
- **Courbes par graphique : 3 maximum** — la courbe active en accent, les
  références en pointillé discret.
- **Texte : une légende d'une ou deux phrases** en bas si le mécanisme n'est
  pas évident. Le gros de l'explication reste dans ta réponse de chat, pas
  dans le panneau.
- **~100-200 lignes de fragment.** Si tu dépasses 250, tu construis une
  application — recadre.

## 3. Système de design (contraignant)

Le panneau vit dans une app au style sobre strict. Il en fait partie.

### Couleurs — uniquement les variables injectées

| Variable | Rôle |
|---|---|
| `var(--fg)` | texte principal, valeurs |
| `var(--fg2)` | texte secondaire fort |
| `var(--muted)` | libellés, axes |
| `var(--muted2)` | graduations, texte éteint |
| `var(--border)` | traits, cadres, grilles |
| `var(--bg-card)` | fond d'une carte interne |
| `var(--accent)` | LA couleur d'accent — la courbe active, la valeur clé |
| `var(--u-ok)` | sémantique : bon, gain, dans la cible |
| `var(--u-warn)` | sémantique : attention, limite |
| `var(--u-hot)` | sémantique : mauvais, perte, hors cible |

Toujours avec repli : `var(--accent, #e77f3e)`, `var(--muted, #90969d)`,
`var(--border, #34393f)`, `var(--u-ok, #98c379)`, `var(--u-warn, #e0b74a)`,
`var(--u-hot, #e06c75)`. Fond du fragment : transparent (l'hôte peint
derrière, et le thème clair/sombre bascule tout seul via les variables).

N'invente AUCUNE autre couleur. Pas de dégradés décoratifs, pas d'arc-en-ciel,
pas d'emoji. L'accent est unique : s'il est partout, il n'accentue plus rien.
La sémantique ok/warn/hot ne compte pas comme accent — elle encode un état.

### Typographie et espacement

- Tailles : 10 px (graduations), 11 px (libellés), 12-13 px (corps),
  15-19 px (la grande valeur qui change). Rien entre, rien au-delà.
- Poids : 400 corps, 500 accent léger, 600 valeurs et titres.
- Tout chiffre qui change : `font-variant-numeric: tabular-nums` — sinon la
  mise en page tremble à chaque mouvement du curseur.
- Espacement en multiples de 4 (4/8/12/16/20). `gap` de flexbox, pas des
  marges bricolées.
- Rayons : 6 px (contrôles), 8-10 px (cartes internes). Bordures 1 px
  `var(--border)`.

### Motion

- Toute transition d'état visible : 120-150 ms (`opacity`, `transform`).
- Boucles d'animation : `requestAnimationFrame`, jamais `setInterval` pour du
  visuel.
- Respecte `prefers-reduced-motion` : `matchMedia("(prefers-reduced-motion:
  reduce)").matches` → pas de boucle décorative, transitions coupées. Une
  animation porteuse de sens (simulation) reste permise mais démarre en pause.

## 4. Lisibilité des graphiques (dataviz)

- **Axes toujours étiquetés** : unité et grandeur, en 9-10 px
  `var(--muted2)`. Un graphique sans axes est une décoration.
- **Grille discrète** : lignes 1 px `var(--border)`, 3-5 lignes maximum.
- **Échelle honnête** : commence à zéro pour des barres ; si tu tronques un
  axe, dis-le. Passe en logarithmique quand les valeurs couvrent plusieurs
  ordres de grandeur (queues de distribution : toujours envisager le log).
- **Référence visible** : la valeur de comparaison (normale, gaussienne,
  baseline, cible) en pointillé `var(--muted)` — le lecteur juge par écart.
- **Point courant marqué** : quand un contrôle déplace un point sur une
  courbe, dessine-le (cercle plein accent) et affiche sa lecture en clair.
- **Jamais** : double axe Y (deux échelles superposées mentent), camembert,
  3D, plus de 3 courbes, légende plus grosse que la figure.
- **Canvas net** : multiplie les dimensions par `devicePixelRatio` et remets
  la taille CSS, sinon flou sur écran Retina.

## 4bis. Finition (ce qui sépare « correct » de « pro »)

- **Nombres à la française** : espace fine pour les milliers (15 787), virgule
  décimale (0,139), unité collée au chiffre avec espace insécable (22 %,
  4,9 σ). Une précision UTILE : 2-3 chiffres significatifs, pas 6 décimales.
- **Étiquetage direct** : nomme la courbe AU BOUT de la courbe (petit texte
  `var(--muted)`), pas dans une légende séparée que l'œil doit aller chercher.
- **Annote le point remarquable** : le creux, le croisement, le seuil — une
  courte étiquette avec un trait fin vaut mieux qu'un paragraphe.
- **Hiérarchie dans le panneau** : la grande valeur qui change (15-19 px, 600,
  accent) domine ; son libellé au-dessus en 10-11 px `var(--muted)` ; le
  contexte en dessous en 10 px `var(--muted2)`. Trois niveaux, jamais plats.
- **États de survol** : un contrôle ou une zone cliquable réagit au survol
  (`opacity`, ou fond `var(--bg-card)`), transition 120-150 ms. Ce feedback
  discret est ce qui fait « vivant ».
- **Le premier regard** : à l'ouverture, le panneau montre déjà un état
  intéressant (valeurs par défaut choisies pour raconter quelque chose), pas
  un graphique vide qui attend qu'on le touche.
- **Transitions d'état** : quand un clic change la figure, une transition
  `opacity` 140 ms évite le claquement ; quand un curseur glisse, la mise à
  jour est immédiate (pas de transition pendant le drag).

## 5. Le pont (fonctions déjà définies pour ton script)

- `sendPrompt(texte)` — propose un message dans le composeur du chat ;
  l'utilisateur le valide lui-même, rien ne part tout seul. Usage fort : un
  bouton « pourquoi ce creux ? », « refais avec ν=8 », « applique à mes
  données » rend le panneau conversationnel. Un ou deux boutons, pas six.
- `saveState(objet)` — mémorise l'état (≤ 4 Ko JSON) pour qu'il survive au
  défilement du fil. Appelle-le à chaque changement de contrôle.
- `window.onRestore = (etat) => {...}` — reçoit l'état mémorisé quand le
  panneau remonte. `etat` peut être `undefined` : repars des valeurs par
  défaut. Implémente-le TOUJOURS, sinon le widget oublie tout au scroll.

## 6. Les formes, avec squelettes

Choisis UNE forme (ou combine deux au maximum). Les squelettes sont des
mécaniques à adapter, pas des gabarits visuels à recopier.

### 6a. Comparateur de scénarios
Quand la question est « qu'est-ce qui change si… entre 2-3 cas discrets ».
```html
<div style="display:flex;gap:8px">
  <label style="font-size:11px"><input type="radio" name="sc" value="a" checked> scénario A</label>
  <label style="font-size:11px"><input type="radio" name="sc" value="b"> scénario B</label>
</div>
<svg id="g" viewBox="0 0 400 120" style="width:100%"></svg>
<script>
var prev=null;
function draw(sc){ /* redessine ; trace prev en pointillé var(--muted) avant, garde le nouveau dans prev */ }
document.querySelectorAll('[name=sc]').forEach(function(r){r.addEventListener("change",function(){draw(r.value);if(saveState)saveState({sc:r.value});});});
window.onRestore=function(s){var v=(s&&s.sc)||"a";document.querySelector('[value='+v+']').checked=true;draw(v);};
draw("a");
</script>
```

### 6b. Simulation (canvas animé)
Quand le TEMPS porte le sens : convergence, échantillonnage, accumulation.
```html
<div style="display:flex;gap:8px;align-items:center">
  <button id="run" style="font-size:11px">lancer</button>
  <button id="rst" style="font-size:11px">réinitialiser</button>
  <span id="n" style="font-size:11px;color:var(--muted,#90969d)">n = 0</span>
</div>
<canvas id="c" style="width:100%;height:150px"></canvas>
<script>
var cv=document.getElementById("c"),dpr=devicePixelRatio||1;
cv.width=cv.clientWidth*dpr; cv.height=150*dpr;
var ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
var on=false,n=0,raf;
function step(){ if(!on)return; /* un ou plusieurs tirages, dessine, n++ */ 
  document.getElementById("n").textContent="n = "+n; raf=requestAnimationFrame(step); }
document.getElementById("run").addEventListener("click",function(){on=!on;this.textContent=on?"pause":"lancer";if(on)step();});
document.getElementById("rst").addEventListener("click",function(){on=false;n=0;/* efface */});
// reduced-motion : démarrer en pause est déjà le défaut — bien.
</script>
```

#### Exemple complet poli (forme simulation)

```html
<div style="display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--fg,#dadee3)">
  <div style="display:flex;align-items:center;gap:12px">
    <button id="run" style="font-size:11px;padding:4px 12px;border:1px solid var(--border,#34393f);border-radius:6px;background:transparent;color:var(--fg,#dadee3);cursor:pointer">lancer</button>
    <span style="font-size:11px;color:var(--muted,#90969d)">ν</span>
    <input id="nu" type="range" min="1" max="30" value="2" style="flex:1;accent-color:var(--accent,#e77f3e)">
    <b id="nuv" style="font-variant-numeric:tabular-nums;min-width:22px;text-align:right">2</b>
  </div>
  <div style="display:flex;gap:24px">
    <div><div style="font-size:10px;color:var(--muted2,#62666c)">moyenne courante</div>
      <div id="m" style="font-size:17px;font-weight:600;color:var(--accent,#e77f3e);font-variant-numeric:tabular-nums">—</div></div>
    <div><div style="font-size:10px;color:var(--muted2,#62666c)">n tirages</div>
      <div id="n" style="font-size:17px;font-weight:600;font-variant-numeric:tabular-nums">0</div></div>
  </div>
  <canvas id="c" style="width:100%;height:120px"></canvas>
  <div style="font-size:10px;color:var(--muted2,#62666c)">trajectoire de la moyenne — ν petit : les sauts des queues lourdes cassent la convergence</div>
</div>
<script>
var cv=document.getElementById("c"),dpr=devicePixelRatio||1;
function size(){cv.width=cv.clientWidth*dpr;cv.height=120*dpr;}
size();
var ctx=cv.getContext("2d");
var on=false,n=0,sum=0,path=[],nu=2;
function tDraw(v){ // Student-t par rapport de normales (Box-Muller) sur chi2
  function g(){var u=Math.random(),w=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*w);}
  var z=g(),chi=0;for(var i=0;i<v;i++){var x=g();chi+=x*x;}
  return z/Math.sqrt(chi/v);
}
function paint(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cv.clientWidth,120);
  var st=getComputedStyle(document.documentElement);
  ctx.strokeStyle=st.getPropertyValue("--border")||"#34393f";
  ctx.beginPath();ctx.moveTo(0,60);ctx.lineTo(cv.clientWidth,60);ctx.stroke(); // référence 0
  ctx.strokeStyle=st.getPropertyValue("--accent")||"#e77f3e";ctx.lineWidth=1.5;
  ctx.beginPath();
  for(var i=0;i<path.length;i++){
    var x=i/Math.max(400,path.length)*cv.clientWidth;
    var y=60-Math.max(-58,Math.min(58,path[i]*18));
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  }
  ctx.stroke();
}
function step(){
  if(!on)return;
  for(var k=0;k<8;k++){n++;sum+=tDraw(nu);path.push(sum/n);}
  document.getElementById("m").textContent=(sum/n).toFixed(3).replace(".",",");
  document.getElementById("n").textContent=n.toLocaleString("fr-CA");
  paint();requestAnimationFrame(step);
}
document.getElementById("run").addEventListener("click",function(){
  on=!on;this.textContent=on?"pause":"lancer";if(on)requestAnimationFrame(step);
});
document.getElementById("nu").addEventListener("input",function(){
  nu=+this.value;document.getElementById("nuv").textContent=nu;
  n=0;sum=0;path=[];paint();
  if(window.saveState)saveState({nu:nu});
});
window.onRestore=function(s){if(s&&s.nu){nu=s.nu;document.getElementById("nu").value=nu;document.getElementById("nuv").textContent=nu;}paint();};
paint();
</script>
```

Remarque ce qui le rend fini : la référence zéro visible, la trajectoire
bornée (pas de sortie de cadre), les nombres en `tabular-nums` au format
français, la légende d'une ligne, le bouton qui devient « pause », le canvas
net en Retina, et le ν qui repart proprement à zéro tirage.

### 6c. Exploration 2D (la souris est le paramètre)
```html
<svg id="g" viewBox="0 0 400 140" style="width:100%;cursor:crosshair"></svg>
<div id="lect" style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">—</div>
<script>
var g=document.getElementById("g");
g.addEventListener("mousemove",function(e){
  var r=g.getBoundingClientRect(), x=(e.clientX-r.left)/r.width; // 0..1
  /* convertis x en paramètre, mets à jour crosshair + lecture */
});
</script>
```

### 6d. Avant/après
```html
<label style="font-size:11px"><input id="sw" type="checkbox"> avec correction</label>
<svg id="g" viewBox="0 0 400 120" style="width:100%"><g id="A"></g><g id="B" style="opacity:0;transition:opacity 140ms"></g></svg>
<script>
document.getElementById("sw").addEventListener("change",function(){
  document.getElementById("B").style.opacity=this.checked?1:0;
  document.getElementById("A").style.opacity=this.checked?0.25:1;
});
</script>
```

### 6e. Table vivante
Un petit tableau (≤ 6 lignes) dont une colonne se recalcule ; surligne le
max/min avec `var(--accent)` automatiquement. Bon pour comparer des méthodes,
des seuils, des modèles.

### 6f. Quiz d'estimation
L'utilisateur devine d'abord (curseur, sans feedback), clique « révéler », et
la vraie valeur apparaît à côté de la sienne avec l'écart en
`var(--u-ok)`/`var(--u-hot)`. Mémorable : l'intuition se corrige.

### 6g. Multi-panneaux liés
Un contrôle, 2-3 petites vues côte à côte qui répondent ensemble : la loi, le
mécanisme, la conséquence chiffrée. La forme « Claude Desktop » classique.
Grille : `display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px`.

### 6h. Formulaire (élicitation)
Quand TU as besoin de choix de l'utilisateur pour continuer (paramètres d'une
analyse, options d'un run). Le widget recueille, compose UNE demande claire,
et `sendPrompt` la propose — l'utilisateur relit et valide dans le composeur.
```html
<div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
  <label>Région :
    <select id="reg"><option>saskatchewan</option><option>peyto</option></select></label>
  <label><input type="checkbox" id="dyn" checked> fraction glacier dynamique</label>
  <label>Seuil σ : <input id="sig" type="number" value="4" min="2" max="10" style="width:56px"></label>
  <button id="go" style="align-self:flex-start">composer la demande</button>
</div>
<script>
document.getElementById("go").addEventListener("click",function(){
  var m="Relance l'analyse : région "+reg.value+", gf_dyn="+(dyn.checked?"oui":"non")+", seuil "+sig.value+" sigma.";
  sendPrompt(m);
});
</script>
```
Règles : 3-5 champs maximum ; le bouton dit ce qu'il compose ; jamais d'envoi
automatique (c'est la garantie du pont) ; libellés en français clair, pas des
noms de variables.

### 6i. Maquette d'interface
Quand la conversation porte sur une UI à construire (un panneau d'Atelier, une
page, un formulaire) : montre la proposition EN VRAI plutôt qu'en prose. Une
maquette est statique-cliquable : les zones réagissent au survol/clic pour
montrer les états, sans logique réelle. Utilise les jetons du thème — la
maquette ressemble ainsi nativement à l'app. Un bouton `sendPrompt`
(« adopte cette disposition ») referme la boucle. Budgets : un seul écran,
pas de navigation multi-pages.

### 6j. Art génératif
Permis quand l'utilisateur le demande ou pour illustrer un concept (bruit,
attracteur, champ de vecteurs, flocons — la glace se prête au génératif).
Canvas + `requestAnimationFrame`, MAIS la sobriété tient : palette = les
jetons (accent + gris + un sémantique au plus), fond transparent, animation
démarrée en pause si `prefers-reduced-motion`. Un `seed` affiché et un bouton
« régénérer » rendent l'œuvre reproductible — et `saveState({seed})` la fait
survivre au défilement. Le monochrome à un accent est une contrainte féconde,
pas une punition.

## 6+. Interactions avancées (le niveau au-dessus)

Patrons éprouvés du monde des « explorable explanations » (Bret Victor,
Nicky Case, NYT, Distill, Seeing Theory). Utilise-les pour élever une forme
de base — c'est là que naît le « wow ».

### Nombre glissable dans la phrase (Tangle)
Un nombre DANS une phrase de prose est glissable horizontalement ; tout le
panneau se recalcule en direct. Souligné pointillé + `cursor: ew-resize`
signalent l'affordance. Parfait pour éliciter un prior sans un seul curseur.
```html
<p style="font-size:13px">Si le prior met <span id="dn" style="border-bottom:1px dashed var(--accent,#e77f3e);cursor:ew-resize;color:var(--accent,#e77f3e);font-weight:600;font-variant-numeric:tabular-nums">26</span> % de masse sous ν = 10, alors <span id="cons">…</span></p>
<script>
var v=26,drag=null;
var dn=document.getElementById("dn");
dn.addEventListener("mousedown",function(e){drag={x:e.clientX,v:v};e.preventDefault();});
window.addEventListener("mousemove",function(e){if(!drag)return;
  v=Math.max(1,Math.min(99,drag.v+Math.round((e.clientX-drag.x)/6)));
  dn.textContent=v; maj(); });
window.addEventListener("mouseup",function(){if(drag&&window.saveState)saveState({v:v});drag=null;});
function maj(){ /* recalcule et réécrit #cons + la figure ; le TEXTE peut changer de mot selon le signe */ }
maj();
</script>
```

### « Trace ta prédiction » (You Draw It, NYT)
Le graphique n'affiche d'abord que les axes. L'utilisateur TRACE sa courbe à
la souris (un point par pixel-x sur mousemove pressé), puis « révéler »
dessine la vraie courbe par-dessus (transition ~600 ms) avec la zone d'écart
ombrée entre les deux. Le choc prédiction-vs-réalité vaut dix explications.
Version science : trace ta tendance d'albédo 2000-2023, révèle la vraie.

### Point de contrôle glissable SUR la courbe
Un ou deux points de la figure se prennent à la souris (`mousedown` sur un
cercle ≥ 12 px de rayon de capture) et la courbe se redessine en les
suivant : ajuster une prior en tirant sur sa bosse, déplacer un seuil.
Le paramètre EST l'objet graphique, pas un curseur à côté.

### Révélation par paliers (sandbox progressif)
Un bouton « niveau suivant » ajoute UNE couche à la fois SUR LA MÊME figure
(les éléments déjà en place ne bougent pas) : d'abord la loi, puis les
tirages, puis la pondération. La complexité s'apprivoise par étages — et ça
contourne proprement le budget « 3 contrôles max » : chaque palier reste
simple.

### Bascule « révéler la vérité »
Variante de l'avant/après : l'état A est ton intuition ou le modèle naïf,
la bascule superpose la réalité (données, postérieure) en transition douce.
Prior vs postérieure, modèle vs observations, hypothèse vs mesure.

### Brush de plage sur l'axe
Glisser sur l'axe des x dessine une sélection semi-transparente
(`var(--accent)` à 15 % d'opacité) et les statistiques du panneau se
recalculent sur CETTE fenêtre : sélectionne 2000-2010 et la tendance se
réestime. Naturel pour toute série temporelle.

### Petits multiples synchronisés
3-4 mini-figures identiques (une par région, par scénario, par ν) qui
répondent ENSEMBLE au même contrôle. Chacune minuscule et sans axes
détaillés ; une seule porte les étiquettes. La comparaison se fait d'un
regard.

### Équation colorée liée à la figure
Chaque terme de l'équation est coloré, et l'élément correspondant de la
figure porte la même couleur (accent pour le terme actif, gris pour le
reste). Survoler un terme surligne son objet graphique. L'équation cesse
d'être décorative : elle devient la légende.

## 7. Accessibilité

- `aria-label` descriptif sur chaque `<svg>`/`<canvas>` (`role="img"`).
- Les contrôles natifs (`input`, `button`, `label`) gardent leur focus
  clavier ; ne remplace pas un bouton par un `<div>` cliquable.
- Cibles de clic ≥ 24 px de haut ; curseurs avec `accent-color:
  var(--accent)`.
- Contraste : texte en `var(--fg)`/`var(--muted)` sur fond transparent est
  déjà calibré — n'éclaircis pas toi-même des gris.

## 8. Anti-patterns (vus en vrai, à ne jamais refaire)

- Écrire un fichier HTML dans /tmp ou work/ et l'ouvrir — l'utilisateur ne
  voit RIEN dans le chat. Le canal widget est le seul valable.
- Recopier l'exemple du guide en changeant deux mots : trois widgets
  identiques d'affilée.
- Page complète avec `<html>`, styles globaux, reset CSS — la coquille s'en
  charge.
- Palette inventée (bleus, verts, violets « pour faire joli »").
- 5 curseurs, 9 stats, 4 courbes : personne ne comprend plus rien.
- Chiffres qui sautent sans `tabular-nums`.
- Données inventées présentées comme des résultats réels.
- Oublier `onRestore` : le widget s'amnésie à chaque défilement.

## 9. Checklist avant d'appeler l'outil

1. La forme choisie rend-elle la CHOSE À COMPRENDRE tangible ?
2. Fragment sans `<html>` ; aucune requête réseau ; données en dur.
3. Couleurs = variables avec replis ; accent unique ; tailles 10-19 px.
4. `tabular-nums` sur tout chiffre mobile ; axes étiquetés ; référence en
   pointillé.
5. `saveState` à chaque changement + `onRestore` implémenté.
6. `height` réaliste (budgets §1) ; testé mentalement en 400 px de large.
7. Appel : `atelier_widget` avec `{ html, title (≤80 car.), height }` — et ne
   recopie pas le HTML dans ta réponse ensuite : le panneau est déjà affiché.
