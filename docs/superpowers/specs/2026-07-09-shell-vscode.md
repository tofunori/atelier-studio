# Shell façon VS Code/Muxy — barre de commande + activity bar complète + panneaux collés

Date : 2026-07-09 · Validé par Thierry (mockup « muxy-shell » approuvé,
rail complet + panneaux collés) · Implémentation : Sonnet 5 xhigh

## Vision (référence : mockup approuvé)

Trois couches, façon VS Code/Muxy :
```
┌ barre 32px pleine largeur : [feux natifs][projet]  [⌘K command center]  [◧ layout][Quick Ask] ┐
├────┬──────────────┬───────────────────────────────────────────────────────────────────────────┤
│rail│ panneau vue  │  surface de travail (chat / galerie / terminal / …)                        │
│48px│ (collé)      │  (collé, 1px de séparation, PAS de cartes flottantes)                      │
└────┴──────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- **Feux natifs GARDÉS**, repositionnés dans la barre 32px (pas de feux custom).
- **Barre fonctionnelle** : jamais vide (nom projet + palette ⌘K + bascules layout).
- **Rail = activity bar complète** : Chats, Surlignés, ‖ Galerie, Browser, Terminal,
  Git, Biblio, Générateur, ‖ projets, ‖ Réglages.
- **Panneaux COLLÉS** : flush, séparateurs 1px, aucun fond `--ground`, aucune ombre.

## 0. Reverts préalables (état actuel cassé à défaire)

L'état actuel a des feux custom + cartes flottantes — à annuler :
- `src-tauri/tauri.conf.json` : retirer `decorations:false`, remettre
  `titleBarStyle: "Overlay"` + `hiddenTitle: true`, AJOUTER
  `trafficLightPosition: { x: 13, y: 10 }` (centre les feux dans la barre 32px —
  valeur de départ, à affiner à l'œil).
- Supprimer `src/components/WindowControls.tsx` et son usage dans Rail.tsx.
- `src/App.css` : retirer les styles cartes flottantes (.main-card ombre/bordure/
  rayon, --ground comme fond des app-row/rail, gouttières 8px, .win-ctrls/.wc*)
  et le `--ground` si plus utilisé. Retirer `.rail-titlebar`.
- Les capabilities window ajoutées (allow-close/minimize/set-fullscreen) : laisser
  (inoffensives) ou retirer, au choix.

## 1. Barre du haut (nouveau composant `TopBar`)

Nouveau `src/components/TopBar.tsx`, rendu en tout premier dans App.tsx (au-dessus
de la rangée rail+panneau+surface). Hauteur **32px**, pleine largeur, fond
`--bg` (ou `--bg-side`), bordure basse 1px `--border2`. `data-tauri-drag-region`
sur le fond (drag principal ; les enfants interactifs stoppent la propagation via
leur nature de bouton).

Contenu (gauche → droite) :
- **Réserve gauche ~78px** pour les feux (padding-left) puis, discret, le nom du
  projet actif (`projectDisplayName(activeProject)`, `--muted`, tabular si besoin).
- `flex:1` spacer.
- **Command center** (centré) : un bouton pilule (~min 280 / max 420px, hauteur 22)
  « Rechercher fichiers, commandes… » + `⌘K`, style sobre (fond `--bg-side`,
  bordure `--border2`, rayon `--r-s`). Clic → `setPaletteOpen(true)` (la palette
  ⌘K/⌘P existe déjà, App.tsx:1433).
- `flex:1` spacer.
- **Bascule de disposition** (segmenté 3 icônes) : Chat / Split / Atelier →
  `setLayout("chat"|"split"|"atelier")` (existe, ⌘1/⌘0/⌘2). Actif = layout courant.
- **Quick Ask** (icône) → l'action ⌘⌥K existante (dispatch qaMode open).

Props : App passe `activeProjectName`, `layout`, `onSetLayout`, `onOpenPalette`,
`onQuickAsk`. Tout branché sur des actions DÉJÀ existantes.

## 2. Panneaux collés (docked) — App.css

- La rangée principale (`.app-row` ou équivalent) : `height: calc(100vh - 32px)`,
  PAS de gap, PAS de padding, fond `--bg`.
- `.rail`, panneau de vue, surface : **flush**, séparés par `border-right: 1px
  solid --border2`. Aucune ombre, aucun rayon, aucun fond `--ground`.
- Fond de chaque zone : rail/panneau `--bg-side`, surface `--bg`. Cohérent avec
  le thème (deux thèmes).

## 3. Rail = activity bar complète (Rail.tsx)

Structure verticale :
1. (option : bouton replier sidebar, garder si utile)
2. **Vues panneau** : Chats, Surlignés → `onSelectView` (existant).
3. `rail-sep`.
4. **Surfaces de travail** : Galerie, Browser, Terminal, Git, Biblio, Générateur.
   RÉUTILISER les icônes du tableau `SURFACES` de AtelierPane.tsx (les extraire
   dans un module partagé, ex. `src/components/surfaces.tsx`, importé par Rail
   ET AtelierPane — pas de duplication). Clic → `onSelectSurface(id)` qui appelle
   la logique `switchSurface` existante (App.tsx:1736 : setLayout si "chat"→"split",
   dispatch `switch-surface`). Icône active = surface courante SI la surface
   atelier est visible (layout ≠ "chat").
5. `rail-sep`.
6. **Projets** (inchangés : pastilles, drag-and-drop, flyout, menus).
7. `flex`, puis **Réglages**.

Largeur rail : **48px** (icônes 34-38px). Le rail défile si trop haut
(overflow-y auto, scrollbar masquée — déjà le cas).

État actif : fond léger `--bg-ctl`/`--panel2` + barrette accent 2px à gauche
(déjà le pattern des rail-view). Un seul actif à la fois cohérent avec ce que
montre la surface/vue courante.

## 4. Surfaces : retirer les onglets internes (AtelierPane.tsx)

La rangée d'onglets de surface (`.surftabs` / le `SURFACES.map`) EN HAUT de
l'AtelierPane est SUPPRIMÉE (le rail la remplace). Garder :
- La rangée des **fichiers ouverts** (Galerie + main.tex + PDF + scripts) — c'est
  différent, ce sont les documents, ils restent en onglets dans la surface Galerie.
- Tout le reste du fonctionnement des surfaces (contenu, iframe galerie, etc.).
L'état `activeSurface` de AtelierPane est désormais piloté par l'event
`switch-surface` (déjà écouté) déclenché depuis le rail — vérifier que
l'écoute existe et fonctionne sans la barre d'onglets.

## 5. i18n

Clés fr/en pour : command center placeholder (`topbar.search`), tooltips layout
(`layout.chat`/`layout.split`/`layout.atelier`), tooltips surfaces si absents
(réutiliser `atelier.*` existants). Retirer `window.*` si WindowControls supprimé.

## Garde-fous (vérifier un par un, les lister dans le rapport)

1. **Feux natifs** : fermer/réduire/plein écran fonctionnent (natifs) ; bien
   positionnés dans la barre (à l'œil — fournir la valeur trafficLightPosition).
2. **Drag fenêtre** par la barre du haut, sans zone morte volant des clics
   (command center, layout, quick-ask restent cliquables).
3. **Palette ⌘K** s'ouvre depuis le command center ET le raccourci.
4. **Bascules layout** (barre + ⌘1/⌘0/⌘2) synchronisées.
5. **Rail surfaces** : cliquer Galerie/Terminal/… affiche la bonne surface ;
   l'icône active reflète l'état ; le raccourci et le rail restent cohérents.
6. **Flyouts projets + Surlignés** : repositionnés sur la nouvelle géométrie
   (barre 32px + rail 48px : `top` et `left` des .rail-flyout/.fly-backdrop/
   .rail-menu à recaler).
7. **Menus contextuels** (threads « Move to… » avec son stopPropagation),
   QuickAsk, popovers : intacts.
8. **Compact/étendu + resize** du panneau : marchent.
9. **AtelierPane** : galerie/PDF/éditeurs/terminal/browser fonctionnent sans la
   barre d'onglets de surface (pilotés par le rail).
10. **Redimensionnement fenêtre** (natif, décorations Overlay conservées).

## Design strict (CLAUDE.md)

Tokens uniquement, tailles 10/11/12/13/15, rayons 6/10, icônes SVG fines
monochromes (réutiliser icons.tsx + SURFACES), transitions 120-150ms,
prefers-reduced-motion, deux thèmes. Sobre — c'est un IDE, pas un jouet.

## Vérifications finales

`npx tsc --noEmit` (ignorer src/test_auto_review*.ts), `npx vite build`,
`cd sidecar && npx vitest run` (195+) tout vert. Beaucoup est visuel : fournir
une LISTE DE CONTRÔLE VISUELLE (zones/états à inspecter, + la valeur
trafficLightPosition retenue). Pas de commit (démon d'auto-commit : ignorer
ses « auto: », jamais de git commit soi-même).

## Hors scope

Réorganisation du contenu des surfaces, nouvelle fonctionnalité, animation
d'apparition, thème. Le fil-d'ariane/indicateur git dans la barre = plus tard.
