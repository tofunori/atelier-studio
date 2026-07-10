# Performance frontend — tranche 022 (juillet 2026)

Méthode : chaque optimisation est une expérience isolée — mesure avant,
changement minimal, mesure après, un commit avec les chiffres. Mesures sur
`npx vite build` (production), tailles min + gzip du chunk d'entrée
`index-*.js`. 301–302 tests frontend verts à chaque étape.

## Résultats

| Étape | Entrée (min) | Entrée (gzip) | Gain min | Commit |
|---|---|---|---|---|
| Baseline post-023 | 1 638,9 KB | 477,1 KB | — | (baseline) |
| Exp 1 — TerminalSurface lazy (xterm) | 1 229,6 KB | 374,0 KB | −409 KB | exp1 |
| Exp 2 — Settings lazy | 1 202,7 KB | 367,5 KB | −27 KB | exp2 |
| Exp 3 — Surfaces atelier lazy (Browser/Git/Biblio/Générateur) | 1 163,3 KB | 356,9 KB | −39 KB | exp3 |
| Exp 4 — KaTeX + remark-math à l'idle | **864 KB** | **267 KB** | −299 KB | exp4 |

**Total : −47 % min (−44 % gzip) sur le chemin critique du boot.**

Chunks différés créés : TerminalSurface (xterm), Settings (26,9 KB),
BrowserTab (13,3), GitSurface (11,9), BiblioSurface (11,0),
GeneratorSurface (3,4), katex js (261,3 KB min / 77,6 gzip) +
katex css (29,3 / 8,0).

## Décisions d'architecture

- **`LazyBoundary`** (src/components/LazyBoundary.tsx) : Suspense +
  ErrorBoundary avec bouton Réessayer — un chunk qui échoue (offline, app
  mise à jour sous les pieds) affiche une notice actionnable, jamais un
  écran vide. Fallbacks neutres (`.pane-slot` / `.term-cell` /
  `.settings-page`) : pas de layout shift.
- **`lazyWithRetry`** : `React.lazy` mémorise un import rejeté — remonter
  le même composant re-lance l'erreur en cache, pas l'import ; le bouton
  Réessayer de la boundary serait décoratif. Le wrapper crée une instance
  lazy neuve par montage, avec UN import mémoïsé par montage (React 19
  peut rejouer l'init d'un lazy rejeté : sans ce memo, un chunk
  durablement absent ré-importerait en boucle). Comportement observé et
  testé : un échec transitoire au premier montage est rejoué par React
  sans jamais commiter la notice (auto-guérison gratuite) ; un échec
  persistant commit la notice, et Réessayer relance réellement le réseau.
  Un module résolu est partagé entre montages — 2ᵉ ouverture instantanée,
  sans re-fallback.
- **Cycle de vie inchangé** : les montages restent gardés par
  `visited.has(...)` dans AtelierPane — le lazy ne change pas QUAND un
  composant monte, seulement d'où vient son code.
- **KaTeX à l'idle, pas au clic** (md.tsx) : les maths sont du contenu de
  chat, pas une surface — on ne peut pas attendre une interaction.
  `requestIdleCallback` (fallback setTimeout 400 ms) charge remark-math +
  rehype-katex + katex.css après le premier rendu ; le hook
  `useMdPlugins()` upgrade les messages déjà affichés. Avant chargement,
  `$x^2$` reste en texte brut — jamais de contenu perdu. Échec réseau
  silencieux : le markdown reste fonctionnel sans maths.

## Fontes — aucun changement (décision documentée)

Au boot, seul `inter-latin-wght-normal` est fetché (vérifié via
`performance.getEntriesByType("resource")` sur le build de prod). Les
4 fichiers MonaspaceNeon (~1,3 MB chacun) sont déclarés en `@font-face`
mais ne se chargent que quand le terminal/éditeur rend du texte — le
comportement natif est déjà optimal, un preload serait une régression.

## Benches dans le bundle — délibéré

Les chunks `#uibench/#homebench/#wsbench/#navbench/#chatbench/#setbench`
restent dans le build : ils sont des imports lazy gardés par le hash
(zéro coût au boot) et le harnais golden (tests/visual/) les exige contre
`vite preview` du build de prod. Les exclure casserait la CI visuelle.

## Garde-fou

`node scripts/check_entry_budget.mjs` (après `npx vite build`) échoue si
l'entrée ré-embarque xterm/katex/remark-math ou dépasse 950 KB min
(mesuré 864 + marge). À lancer dans toute QA qui touche les imports.

## Tests ajoutés

- `src/components/LazyBoundary.test.tsx` — fallback pendant chargement,
  notice + retry qui relance réellement l'import, 2ᵉ montage instantané.
- `src/components/chat/mathIdle.test.tsx` — `$x^2$` en texte brut avant
  chargement, upgrade KaTeX après l'idle, texte environnant préservé.
