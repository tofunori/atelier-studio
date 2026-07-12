# Plan 022: Réduire le coût de chargement du frontend final

> **Executor instructions**: charger `/efficient-fable`. Mesurer le produit après
> 021; ne pas réutiliser aveuglément la baseline ancienne. Optimiser par frontière
> de surface réelle. Aucun `manualChunks` arbitraire, retrait de fonte ou cache
> complexe sans preuve avant/après.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- vite.config.ts package.json src/App.tsx src/components src/styles src/assets/fonts gallery src-tauri/tauri.conf.json`
> puis `git status --short --` sur ces chemins.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 023
- **Category**: performance frontend
- **Planned at**: commit `8baafca`, 2026-07-09
- **Supersedes**: plan 012

## Pourquoi maintenant

La mesure historique montrait environ 1.624 MB de JS minifié (~474 KB gzip),
156 KB de CSS et quatre fontes Monaspace d'environ 1.3 MB chacune. Mais les plans
015–021 changent les frontières du graphe. Optimiser avant aurait figé une
architecture transitoire. Ce plan mesure le produit final et réduit le coût sans
dégrader le premier geste utile : reprendre un thread ou ouvrir un artefact.

## Budget et métriques

Mesurer séparément :

- poids minifié et gzip de l'entrée;
- poids total chargé au Research Home;
- poids différé par Settings, Terminal, Galerie/Atelier et previews;
- fontes chargées au démarrage;
- temps lancement app → shell visible;
- temps shell → Research Home interactif;
- temps premier thread → timeline visible;
- temps premier terminal et seconde ouverture;
- temps première galerie/figure;
- nombre de requêtes/chunks et erreurs de chargement;
- mémoire après navigation Home → Chat → Galerie → Settings → Chat.

Capturer machine, build release/dev, état cache et corpus. Comparer toujours la
même app buildée et le même scénario. Les chiffres absolus sans contexte ne
suffisent pas.

## Cibles indicatives

- entrée initiale <1.0 MB minifiée si possible sans waterfall;
- fontes initiales <3.0 MB;
- Terminal/xterm absent du chemin initial si non visible;
- Settings et surfaces rares différées si le graphe le justifie;
- aucun écran vide perceptible;
- aucune régression >10 % du temps interactif médian;
- aucun flash de police/layout;
- deuxième ouverture d'une surface égale ou meilleure que la première.

Si une cible n'est pas rentable, documenter mesure, coût, risque et décision de
ne pas optimiser. Le plan peut être DONE avec une décision argumentée.

## Étape 1 — Nouvelle baseline

1. `npm run build:web` avec rapport d'assets.
2. Visualiser le graphe avec un outil déjà disponible ou analyse Vite temporaire
   sans dépendance runtime.
3. Capturer trace app release pour les scénarios métriques.
4. Identifier modules réellement présents dans l'entrée : xterm, markdown,
   Mermaid, Settings, previews, galerie host, éditeurs, PDF.
5. Noter les imports déjà dynamiques; Mermaid l'était historiquement, ne pas
   régresser.
6. Vérifier quelles variantes Monaspace sont réellement demandées par CSS et
   terminal.

Le rapport avant modifications est obligatoire.

## Étape 2 — Frontières lazy par surface

Ordre d'essai :

1. Terminal/xterm si absent de l'écran initial;
2. Settings;
3. viewers lourds PDF/image/HTML spécifiques;
4. surfaces rarement ouvertes identifiées par la trace;
5. bibliothèques de rendu scientifique non critiques.

Pour chaque frontière :

- import dynamique au niveau d'une action/surface, pas d'un micro-composant;
- fallback utilisant les primitives Atelier et géométrie stable;
- ErrorBoundary avec retry et détail utile;
- préchargement intentionnel après idle/hover seulement si mesuré;
- état utilisateur conservé après résolution;
- pas de boucle de suspense ni de requêtes séquentielles inutiles;
- test première et deuxième ouverture;
- mesure avant/après isolée.

Ne pas lazy-load Chat/Research Home/markdown critique si cela crée un waterfall
plus coûteux que le gain.

## Étape 3 — Fontes

Inventorier regular/medium/bold/italic réellement utilisés. Tester une matrice :

- chrome système sans téléchargement;
- Monaspace Regular + variante nécessaire pour terminal/code;
- synthèse bold/italic seulement si rendu ANSI, code et symboles restent corrects;
- glyphes Nerd Font réellement nécessaires;
- licence/NOTICE préservés.

Contrôles visuels : terminal ASCII, Unicode, powerline/icons, bold, italic,
ligatures si activées, code editor, tableaux monospace, dark/light et écran
Retina. Aucun retrait si alignement ou glyphes se dégradent. Préférer sous-ensemble
officiel/déterministe seulement avec provenance et processus reproductible.

## Étape 4 — CSS et assets

- identifier règles globales mortes avec prudence; la galerie/webview et états
  dynamiques peuvent échapper à l'analyse statique;
- ne supprimer que les sélecteurs démontrés inutilisés par recherche + tests;
- vérifier que tokens/primitives ne sont pas dupliqués dans plusieurs bundles;
- optimiser images de fixtures uniquement si elles se retrouvent en production;
- garder sourcemaps selon politique release existante;
- ne pas compresser à la main un asset que Vite/Tauri gère déjà mieux.

## Étape 5 — Runtime et fuites

À l'aide des traces/tests :

- vérifier timers/listeners après navigation répétée;
- annuler preview/fetch/import obsolète;
- éviter remount complet de timeline/galerie au simple changement de sélection;
- mémoïser seulement les calculs mesurés coûteux;
- virtualiser uniquement si le corpus réel montre un problème;
- contrôler que les fixtures/harnais visuels ne sont pas inclus en release;
- vérifier que le lazy loading ne casse pas le mode offline/local.

## Étape 6 — Rapport avant/après

Créer `docs/performance/frontend-2026-07.md` avec :

- commit et environnement;
- tableau assets/chunks/fonts avant/après;
- cinq scénarios avec médiane de plusieurs runs;
- captures/trace pertinentes;
- changements retenus et rejetés;
- cibles atteintes ou raisons;
- risques et commandes de reproduction;
- budget recommandé pour futures dépendances.

Ne pas présenter un seul run comme une amélioration certaine.

## Tests

- tests frontend pour fallbacks, ErrorBoundary, retry et état conservé;
- test build qui confirme absence de xterm dans entrée si optimisé;
- tests app offline pour chunks locaux;
- visual regression sur fallback/chargement;
- terminal complet après premier/second load;
- galerie/viewers après navigation;
- aucune erreur chunk après relance d'une app mise à jour.

## Verification

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
npm run verify:e2e
```

Puis protocole `AGENTS.md` et scénarios : cold/warm launch, Home, historique,
premier/second terminal, Mermaid, PDF/figure, Settings, thème, offline local,
navigation répétée et relance app.

## Done criteria

- [ ] Baseline post-021 reproductible et rapportée.
- [ ] Chaque optimisation a une mesure avant/après isolée.
- [ ] Frontières lazy correspondent à des surfaces utilisateur.
- [ ] Fallbacks/erreurs suivent le design Atelier.
- [ ] Terminal/viewers/glyphes sont contrôlés visuellement.
- [ ] Aucun écran vide, perte d'état, waterfall ou erreur de chunk.
- [ ] Fixtures visuelles/debug absentes du bundle release.
- [ ] Cibles atteintes ou décision de non-optimisation argumentée.
- [ ] Rapport donne un budget durable aux futures dépendances.

## STOP conditions

- Temps interactif ou deuxième ouverture se dégrade >10 %.
- Un glyph, alignement terminal, Mermaid, PDF ou mode offline casse.
- Le gain gzip est <5 % pour une complexité runtime significative.
- L'optimisation nécessite `manualChunks` par nom de vendor sans frontière UX.
- Une dépendance de mesure resterait dans le runtime production.
- Les chiffres avant/après ne sont pas comparables.

## Git workflow

Sans instruction, aucun commit/push. Si autorisé, branche
`fable/022-frontend-performance`; un commit par optimisation mesurée, avec chiffres
dans le message/rapport. Revert immédiat d'une expérience non rentable.
