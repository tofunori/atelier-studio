# Design B — Panneaux flottants (refonte visuelle du shell)

Date : 2026-07-08 · Validé par Thierry (maquette B de l'artefact
« topbar-redesign » choisie) · Implémentation : Sonnet 5 xhigh

## Intention

Le shell de l'app passe du modèle « colonnes pleine hauteur collées aux bords »
au modèle « cartes flottantes sur un fond » :

```
┌ fenêtre (fond --ground, nouveau token) ─────────────────┐
│  ● ● ●   Atelier — <projet actif>          (zone titre) │
│ ┌────┐ ┌──────────┐ ┌─────────────────────────────────┐ │
│ │rail│ │ panneau  │ │  zone principale (chat/atelier) │ │
│ │    │ │ de vue   │ │                                 │ │
│ └────┘ └──────────┘ └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- **Zone titre** (~42px) : fond = le fond de fenêtre, contient les feux
  tricolores (titleBarStyle Overlay — ils flottent déjà en haut-gauche, la
  zone leur laisse la place), le nom de l'app/projet actif en `--muted2`
  discret, et c'est le **drag region principal** (`data-tauri-drag-region`).
- **Cartes** : rail, panneau de vue, zone principale — chacune
  `background: var(--bg-side)` ou équivalent carte, `border: 1px solid
  --border2`, `border-radius: var(--r-m)` (10px — PAS de nouveau rayon,
  système 6/10 respecté), ombre douce réutilisant `--elev` (existe déjà).
- **Gouttières** : 8px entre cartes et contre les bords bas/gauche/droite
  (multiple de 4, système d'espacement respecté).

## Nouveau token

UN seul : `--ground` (fond de fenêtre derrière les cartes), défini pour les
deux thèmes dans App.css à côté des tokens existants — sombre : un cran plus
sombre que --bg (genre #0a0b0d si --bg est ~#101114 ; dériver via color-mix
du --bg existant plutôt qu'un hex arbitraire si possible : `color-mix(in
srgb, var(--bg) 78%, black)`) ; clair : un cran plus soutenu que le fond
actuel (même logique inversée). AUCUN autre token/rayon/taille inventé.

## Chantier (fichiers en scope)

- `src/App.tsx` : structure racine — insérer la zone titre au-dessus de la
  rangée `app-row`/PanelGroup existante ; le drag region principal y migre.
  Les `side-top` avec data-tauri-drag-region existants (App.tsx:286,
  Sidebar.tsx:389) PERDENT leur drag region (la zone titre le remplace) mais
  gardent leur rôle visuel. `chat-dragbar` (Chat.tsx:1276) : à réévaluer —
  probablement supprimable, décision documentée.
- `src/App.css` : le gros du chantier.
  - `html/body/#root/.app` : fond `--ground`.
  - `.app-row` (l.392) : hauteur = 100vh − zone titre, `gap: 8px`,
    `padding: 0 8px 8px`.
  - `.rail` (l.394) : devient carte (fond, bordure, rayon, ombre) — largeur
    80px conservée.
  - `.side-fixed` / le panneau de vue : carte.
  - La zone principale (PanelGroup/surfaces atelier) : carte englobante —
    ATTENTION : la surface atelier a ses propres panneaux internes
    (atelier-split, éditeurs, PDF…) qui restent tels quels À L'INTÉRIEUR de
    la carte ; seul le conteneur extérieur devient carte.
  - `.rail-flyout` (l.1905, `position:fixed; left:80px; top:0; bottom:0`) :
    recaler sur la nouvelle géométrie (left = 8px gouttière + 80px rail +
    8px ; top sous la zone titre ; bottom 8px ; rayon/ombre de carte pour
    cohérence). Tester mentalement le cas panneau ouvert + flyout.
  - Menus contextuels/popovers `position:fixed` : coordonnées souris,
    inchangés.
- `src-tauri/tauri.conf.json` : NE PAS changer titleBarStyle. Si un décalage
  des feux est nécessaire pour les centrer dans la zone 42px, l'option
  `trafficLightPosition` existe — ne l'utiliser QUE si le rendu par défaut
  est clairement décentré, et le documenter.
- `src/components/Sidebar.tsx`, `src/components/Rail.tsx` : retouches
  minimales (drag region, éventuel padding) — pas de refonte.

## Garde-fous fonctionnels (à vérifier explicitement, un par un)

1. Fenêtre déplaçable en attrapant la zone titre (drag region), et PLUS de
   zones mortes de drag qui volent des clics.
2. Mode compact (rail seul) ET mode étendu : les cartes se recalent, pas de
   trou bizarre. Le redimensionnement du panneau (sideW) marche encore.
3. Flyout projets + flyout surlignés : positionnés correctement dans la
   nouvelle géométrie, au-dessus des cartes (z-index).
4. Menus contextuels (threads « Move to… », projets), popovers d'effort,
   QuickAsk, modales : intacts (position:fixed aux coordonnées souris).
5. Surface atelier (galerie/PDF/éditeurs/terminal) : rien ne déborde de la
   carte (overflow), les onglets internes intacts.
6. Settings pleine page : soit il devient une carte pleine largeur dans la
   zone, soit il garde son plein écran actuel — choisir le plus simple et
   cohérent, documenter.
7. Plein écran macOS (feux masqués par le système) : la zone titre reste
   correcte (pas de trou géant — hauteur fixe acceptable).

## Design strict (CLAUDE.md)

Tokens partout, rayons 6/10 uniquement, espacement multiples de 4 (gouttières
8px), ombre via `--elev` existant, transitions 120-150ms si des états animent,
prefers-reduced-motion. Pas de gradient, pas de nouvelle couleur hors
`--ground`.

## Vérifications finales

`npx tsc --noEmit` (ignorer src/test_auto_review*.ts), `npx vite build`,
`cd sidecar && npx vitest run` (195+) tout vert. Beaucoup de ce chantier est
visuel : produire dans le rapport une LISTE DE CONTRÔLE visuelle précise pour
Thierry (zones à regarder, états à tester). Pas de commit (démon d'auto-commit
en fond : ignorer ses « auto: », jamais de git commit soi-même).

## Hors scope

Réorganisation fonctionnelle (tout le comportement reste identique), thème,
nouvelle vue, animation d'apparition des cartes.
