# Lot 2 — Fiches surlignées durables + vue « Surlignés »

Date : 2026-07-08 · Validé par Thierry (maquettes A/B/C : carnet de cartes
retenu ; fiches AUTONOMES survivant à la suppression des chats) ·
Implémentation : Sonnet 5 xhigh

## Principe directeur (décision utilisateur)

Un surligné est une **fiche de lecture autonome**, pas un lien vers un chat :
tout est photographié À LA CRÉATION (passage, contexte autour, projet, titre
du chat, provider, date). L'utilisateur efface des chats — la fiche survit.
« Ouvrir le chat » n'existe que si le thread existe encore (bonus discret).

## 1. Store durable (sidecar)

Nouveau `sidecar/highlights.mjs` : fichier `APP_DIR/highlights.json`
(APP_DIR = ~/Library/Application Support/atelier-studio, cf. index.mjs:31),
écrit via `writeFileAtomic` (store.mjs l'exporte). Entrée :

```json
{ "id": "uuid", "text": "passage", "context": "…phrase avant [passage] phrase après…",
  "kind": "hl" | "ul", "projectRoot": "/abs/path", "projectName": "manuscript_ch1",
  "threadId": "…", "threadTitle": "titre au moment de la capture",
  "provider": "claude", "createdAt": "ISO" }
```

Cases ws dans `router.mjs` (pattern des cases threads existants) :
- `addHighlight {highlight}` → append + broadcast `highlights` (liste complète) ;
- `removeHighlight {id}` → retire + broadcast ;
- `listHighlights {}` → répond `{type:"highlights", highlights:[…]}`.
Le sidecar génère l'id/createdAt (source de vérité). Tri : plus récent d'abord.

### Migration des marks localStorage existants

Au premier chargement côté front (une seule fois, flag localStorage
`atelier-studio.marksMigrated`) : parcourir les clés
`atelier-studio.marks.<threadId>`, envoyer chaque mark en `addHighlight` avec
le contexte introuvable → `context: ""` et les métadonnées reconstituables
depuis `threads` (titre/projet si le thread existe encore, sinon champs vides).
Ne PAS supprimer les clés localStorage (elles servent encore au rendu in-chat,
cf. §3) — le flag évite juste la double migration.

## 2. Capture à la création (Chat.tsx)

Au clic « surligner »/« souligner » dans le popover de sélection existant
(`toggleMark`, ~l.863) :
- garder le comportement in-chat actuel (mark localStorage + CSS Highlight
  API) Mais supprimer le toggle-suppression accidentel : si la sélection
  correspond à un mark existant, le popover montre « Retirer le surlignage »
  (action explicite) au lieu de supprimer silencieusement ;
- ET envoyer `addHighlight` au sidecar avec le **contexte capturé** : le
  texte du message contenant la sélection, tronqué à ~280 caractères centrés
  sur le passage (chercher le message dans p.events dont e.text contient la
  sélection ; si introuvable, context = "") ; projectRoot/threadTitle/provider
  depuis les props/thread actif.
- « Retirer » in-chat retire AUSSI la fiche correspondante (match par
  threadId+text+kind) via removeHighlight — mais une fiche supprimée depuis
  la vue Surlignés ne touche PAS le mark in-chat (asymétrie assumée : la
  fiche est une copie).

## 3. Rendu in-chat : inchangé dans ce lot

Le rendu CSS Highlight API par thread reste tel quel (localStorage). Sa
durabilité disque viendra plus tard si besoin — la valeur durable est dans
les fiches. NE PAS refondre ce mécanisme ici (scope control).

## 4. Vue « Surlignés » (remplace le placeholder HighlightsPanel, App.tsx:163)

Carnet de cartes (maquette C validée) dans le panneau latéral :
- En-tête : « Surlignés » + compteur + bouton export (icône download fine).
- Rangée de chips filtres : « Tous n » + un chip par projet AYANT des fiches
  (pastille couleur du projet via projMeta, nom court). Chip actif = style
  `.chip.on` sobre.
- Grille de cartes (1 colonne dans le panneau ~272px) : passage (clamp 5
  lignes), barrette gauche 3px (ambre `--hl-line` pour hl, `--accent` pour
  ul — définir --hl-line dans les tokens s'il n'existe pas : ambre sobre,
  deux thèmes), pied : pastille projet + nom + date relative + croix retrait
  (visible au hover). Clic sur une carte : déplie le contexte complet dans
  la carte (accordéon léger) + bouton « Ouvrir le chat » SEULEMENT si
  threadId existe encore dans threads.
- Vide : message sobre « Sélectionne du texte dans un chat pour créer ta
  première fiche » en --muted2.
- Le clic projet dans la barre d'activité, quand la vue Surlignés est active,
  FILTRE les fiches de ce projet (hook prévu au lot 1) — re-cliquer le même
  projet = retour à « Tous ».

## 5. Flyout au survol de l'icône surligneur (parité avec les projets)

Comme le survol d'une pastille projet ouvre le flyout des chats : survoler
l'icône Surlignés du rail ouvre un flyout (même pattern/style `.rail-flyout`,
même logique openOnHover/cancelHover — RÉUTILISER le mécanisme existant de
Rail.tsx, pas une réimplémentation) listant les ~8 fiches les plus récentes
(passage clampé 2 lignes + projet). Clic sur une fiche → bascule la vue
Surlignés (+ scroll/filtre non requis, simple bascule suffit). Clic sur
l'icône → bascule la vue (comportement lot 1 conservé).

## 6. Export Markdown

Bouton export : génère un .md groupé par projet puis chat
(`## projet`, `### chat — date`, `> passage` + contexte en italique si
présent), sauvegardé via le plugin dialog existant (`@tauri-apps/plugin-dialog`,
déjà utilisé — chercher `save(` dans src/) ou à défaut copié au presse-papier
avec confirmation sobre. Choisir le mécanisme déjà présent dans l'app.

## Design (contraignant)

Tokens uniquement ; cartes : fond `--raise`/équivalent, bordure `--border2`,
rayon `--r-m`, barrette 3px ; chips : `--r-pill` ; tailles 11/12/13 ;
croix/boutons : icônes SVG fines existantes (CloseIcon…). Ambre surligneur :
une seule nouvelle variable CSS `--hl-line` (+ fill translucide si utile),
définie pour les deux thèmes, sobre (pas de jaune fluo).

## Tests (obligatoires)

- `sidecar/highlights.test.mjs` : store (add/remove/list, tri, persistance
  atomique via tmpdir, ids uniques), cases router (add/remove/list +
  broadcast) — pattern router.test.mjs existant.
- Helpers front purs testables si extraits (ex. construction du contexte
  ~280 chars centré) : dans src/lib/ + test sidecar comme markdown.test.mjs.

## Vérifications finales

`npx tsc --noEmit` (ignorer src/test_auto_review*.ts), `npx vite build`,
`cd sidecar && npx vitest run` (177+) tout vert. Pas de commit (démon
d'auto-commit : ignorer ses « auto: », jamais de git commit soi-même).

## Hors scope

Refonte du rendu in-chat (§3), recherche plein-texte dans les fiches,
tags/notes manuelles sur les fiches, ancres vers le message précis.
