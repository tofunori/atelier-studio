# Lot 1 — Barre d'activité façon VS Code (panneau gauche)

Date : 2026-07-08 · Validé par Thierry (maquette cliquable approuvée) ·
Implémentation : Sonnet 5 xhigh

## Contexte & intention

Le rail actuel (`src/components/Rail.tsx`, 291 l.) mélange projets et actions.
On le formalise en **barre d'activité** : en haut des icônes de **vues** qui
changent le contenu du panneau latéral, au milieu les **projets** (inchangés),
en bas `+` projet et Réglages (inchangés). La sidebar actuelle devient le
panneau de la vue « Chats », tel quel. Une vue « Surlignés » arrive au lot 2 —
ce lot pose le squelette avec la vue Chats seule fonctionnelle + l'emplacement
Surlignés (icône présente, panneau placeholder sobre « à venir » OU masquée
derrière un flag — choisir l'option la plus propre, voir §Vues).

Référence visuelle : maquette validée (artefact « rail-vscode-design ») —
activity bar 52px, icônes de vue 38px avec état actif fond léger + barrette
accent 2px à gauche, séparateur fin, pastilles projet actuelles conservées.

## Structure cible

```
┌──────┬──────────────┬──────────────────────────┐
│ abar │  panneau vue │   zone principale        │
│ 52px │  (sidebar)   │   (chat/atelier, INTACT) │
└──────┴──────────────┴──────────────────────────┘
```

### Barre d'activité (Rail.tsx refondu)

Ordre vertical :
1. Bouton « déplier la sidebar » (existant, conservé tel quel en tout premier
   OU intégré autrement si plus propre — juger sur place ; le comportement
   compact/étendu actuel de la sidebar doit survivre).
2. **Vues** : « Chats » (icône bulle de conversation) puis « Surlignés »
   (icône surligneur/marqueur). SVG inline monochromes, stroke 1.3–1.5,
   fill none, cohérents avec `src/components/icons.tsx` — AJOUTER les deux
   icônes dans icons.tsx (`ChatsIcon`, `HighlighterIcon`), pas d'emoji,
   pas de lib d'icônes externe.
   État actif : fond `--bg-ctl`/équivalent léger + barrette accent 2px à
   gauche (::before). Repos : `--muted2`, hover : `--fg` + fond léger.
3. Séparateur fin (1px, `--border`, largeur ~24px centré).
4. **Projets** : le bloc actuel (pastilles couleur, drag-and-drop, flyout au
   survol, menu contextuel) — NE PAS le refondre, le déplacer sous le
   séparateur. Le `+` (ajouter un projet) reste attaché au bloc projets.
5. `flex` spacer puis **Réglages** en bas (existant).

Le bouton « nouveau chat » actuel du rail : le garder accessible (soit à sa
place actuelle, soit dans l'en-tête du panneau Chats qui a déjà un pattern
équivalent dans Sidebar.tsx — choisir UNE maison, pas deux).

### Panneau de vue

- État `activeView: "chats" | "highlights"` dans App.tsx (persisté dans le
  settings existant — champ `activeView` ajouté à Settings avec défaut
  "chats" ; le merge DEFAULT_SETTINGS existant le gère).
- Vue « chats » → le composant Sidebar actuel, inchangé fonctionnellement.
- Vue « surlignés » → ce lot livre un panneau placeholder minimal (en-tête
  « Surlignés » + message sobre « bientôt » centré en `--muted2`) SI l'icône
  est visible. Alternative acceptable : ne pas afficher l'icône Surlignés du
  tout dans ce lot (le lot 2 l'activera) — préférer CETTE option si le
  placeholder crée plus de code jetable qu'un flag simple. Décision à
  documenter dans le rapport.
- Cliquer la vue active NE désélectionne pas (pas de toggle) ; cliquer un
  projet bascule implicitement sur la vue « chats » si on est ailleurs
  (le projet est le contexte des chats aujourd'hui ; au lot 2, le projet
  filtrera aussi les surlignés — prévoir le hook mais pas l'implémenter).

### Mode compact vs étendu

Aujourd'hui : rail seul (compact) OU sidebar étendue. La barre d'activité
est TOUJOURS visible ; le bouton déplier/replier ne concerne que le panneau
de vue. Vérifier les deux états + la persistance existante de ce réglage.

## Design (contraignant — CLAUDE.md projet)

- Icônes : SVG monochromes stroke 1.3–1.5, AUCUN emoji, AUCUNE couleur de
  remplissage. Tailles 18-19px dans des boutons 38px.
- Tokens uniquement (tailles 10/11/12/13/15, rayons 6/10, couleurs via
  variables). Barrette active : `--accent`, 2px, rayon 2px.
- Transitions 120-150ms opacity/transform, respecter prefers-reduced-motion.
- Aucune nouvelle valeur inventée : reprendre les mesures de la maquette qui
  sont déjà dans le système (52px de rail existe déjà ? vérifier la largeur
  actuelle du rail et NE PAS la changer sans raison).

## Fichiers en scope

- `src/components/Rail.tsx` (refonte structure — garder les sous-composants
  projets/flyout/menus tels quels, les re-parenter)
- `src/components/icons.tsx` (+ ChatsIcon, HighlighterIcon)
- `src/components/Sidebar.tsx` (uniquement si l'en-tête du panneau doit
  s'unifier — minimal)
- `src/App.tsx` (état activeView + branchement panneau ; le handler projets
  existant)
- `src/lib/settings.ts` (champ activeView, défaut "chats")
- `src/App.css` (styles abar — préfixe .abar ou extension des .rail-*
  existants, au choix le plus propre)
- `src/lib/i18n.ts` (libellés/tooltips fr+en : view.chats, view.highlights)

## Hors scope

Vue Surlignés fonctionnelle, store de surlignés, fix du surlignage in-chat
(= lot 2). Aucun changement à la zone principale, aux flyouts projets, aux
menus contextuels, au drag-and-drop projets.

## Garde-fous fonctionnels (à vérifier explicitement)

- Le flyout des chats au survol d'un projet marche encore (rail compact).
- « Move to… » et le menu contextuel de threads marchent encore.
- Le drag-and-drop de réordonnancement des projets marche encore.
- Sélection projet / nouveau chat / réglages : comportements identiques.
- Redémarrage : la vue active et l'état compact/étendu persistent.

## Vérifications finales

`npx tsc --noEmit` (ignorer src/test_auto_review*.ts), `npx vite build`,
`cd sidecar && npx vitest run` (176+) — tout vert. Pas de commit (démon
d'auto-commit en fond, ignorer ses « auto: », ne jamais commit soi-même).
