# [RÉSOLU 2026-07-11] Page Réglages noire dans l'app buildée (tranche 022)

**Résolution** : le fallback Suspense restait affiché pour toujours.
`lazyWithRetry` créait une instance `React.lazy` neuve à chaque montage ;
React rejoue un montage initial suspendu en RE-MONTANT le sous-arbre →
chaque replay repartait d'une instance vierge qui re-suspendait (même une
promesse déjà résolue suspend au premier rendu) → boucle fallback infinie,
visible en WKWebView seulement (timing Chromium la masquait). Fix dans
src/components/LazyBoundary.tsx : instance lazy partagée entre montages,
recréée uniquement après échec. Preuve : sonde DOM `children:0 → children:2`
(nav Réglages complète) après fix. Document conservé pour la méthode de
diagnostic (balises HTTP locales via CSP connect-src 127.0.0.1).

---


## Contexte

App macOS **Tauri 2** (WKWebView, frontend servi via `tauri://localhost`, assets
embarqués dans le binaire release). Frontend **React 19 + Vite 7**.
Repo : `/Users/tofunori/Documents/atelier-studio/.claude/worktrees/atelier-022-perf`
(worktree git, branche `claude/atelier-022-perf`, basée sur `claude/atelier-023-polish`).

La tranche 022 (perf) a introduit du **code-splitting** : `React.lazy` +
`import()` dynamique pour TerminalSurface (xterm), Settings, BrowserTab,
GitSurface, BiblioSurface, GeneratorSurface, et chargement à l'idle de
KaTeX/remark-math. Entrée réduite de 1639 → 864 KB min. Fichiers clés :

- `src/components/LazyBoundary.tsx` — Suspense + ErrorBoundary avec retry,
  et `lazyWithRetry()` (une instance lazy neuve par montage, import mémoïsé
  par montage, module résolu partagé).
- `src/App.tsx` ligne ~28 : `const SettingsPage = lazyWithRetry(() => import("./components/Settings"));`
  rendu dans `if (showSettings) { <LazyBoundary fallback={<div className="settings-page" />}><SettingsPage …/></LazyBoundary> }`.
- `src/components/AtelierPane.tsx` : 5 surfaces lazy, montages gardés par
  `visited.has(...)` (inchangé).

## Symptôme

Dans l'app **buildée** uniquement (`npm run tauri build`, bundle
`src-tauri/target/release/bundle/macos/Atelier.app`) :

1. Premier build : clic sur Réglages → notice d'erreur de la LazyBoundary
   (« Module introuvable (hors ligne ou app mise à jour) » + bouton Réessayer).
2. Builds suivants (après invalidation du cache codegen, voir plus bas) : la
   page Réglages s'affiche **entièrement noire** (aucune notice, aucun contenu
   visible). L'utilisateur voit aussi parfois une fenêtre noire au boot.
3. Tout fonctionne parfaitement en Chromium : `npx vite build && npx vite preview`
   → Réglages OK ; 13 goldens Playwright (dont 2 captures Settings) passent ;
   305 tests vitest verts ; `npx tsc --noEmit` propre.

## Diagnostic déjà fait (balise HTTP locale — CSP autorise http://127.0.0.1:*)

Sondes posées : script inline dans `index.html` (hashé par Tauri dans le CSP,
s'exécute toujours), balise au début du module d'entrée (`src/main.tsx`),
sonde autour de `import("./components/Settings")` dans App.tsx,
`componentDidCatch` de la LazyBoundary. Résultats dans l'app buildée :

- `html-inline` reçu (href = `tauri://localhost`, UA WebKit 605.1.15) ✓
- `entry-module-start` reçu → **le module d'entrée s'exécute** ✓
- `after-load-2s` : `rootChildren: 2` → **React monte l'UI** ✓
- Aucun `resource-error`, aucun `onerror`, aucun `unhandledrejection` ✗
- Clic Réglages : `settings-import-start` puis `settings-import-ok`
  `{hasDefault:true}` **45 ms plus tard** → **le chunk Settings se charge et
  s'évalue correctement** ✓
- `componentDidCatch` de la LazyBoundary : jamais déclenché → **le rendu de
  Settings ne throw pas** ✗
- Aucun rapport de crash dans ~/Library/Logs/DiagnosticReports.

Conclusion intermédiaire : **ni l'import dynamique, ni une exception de rendu.
La page se monte mais s'affiche noire — problème de rendu/peinture ou de CSS
spécifique à WKWebView, ou quelque chose la recouvre.**

## Pièges déjà rencontrés et réglés (ne pas re-perdre du temps dessus)

- **Cache `generate_context!`** : cargo peut rebuiler sans ré-embarquer le
  dist (binaire de taille identique, assets périmés → hash de chunks
  incohérents → échec d'import réel la première fois). Fix : `touch
  src-tauri/src/lib.rs` avant `npm run tauri build`, puis vérifier
  `strings <binaire> | grep -oE "index-[A-Za-z0-9_-]{8}\.js"` == `ls dist/assets`.
  C'est probablement la cause de la notice initiale (étape 1 du symptôme) ;
  les builds récents sont vérifiés cohérents (EMBED==DIST) et l'import passe.
- La feature `devtools` est maintenant activée dans `src-tauri/Cargo.toml`
  (`tauri = { version = "2", features = ["unstable", "devtools"] }`) → clic
  droit → Inspect Element marche en release. **Premier réflexe : ouvrir
  l'inspecteur sur la page noire** et regarder le DOM de `.settings-page`
  (existe ? dimensions ? couleurs calculées ? feuille de style manquante ?).
- Une sonde `settings-dom` est déjà en place dans App.tsx (photographie du DOM
  600 ms après ouverture des Réglages, POST sur `http://127.0.0.1:18917/boot`)
  — lancer un listener local pour la recevoir, ou remplacer l'URL.
- CSP actuel (tauri.conf.json) : `default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:
  http://127.0.0.1:* asset: http://asset.localhost; connect-src 'self'
  ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* ipc: http://ipc.localhost;
  frame-src http://127.0.0.1:*; font-src 'self' data:`.

## Pistes restantes (par ordre de probabilité)

1. **CSS par chunk** : vérifier si Vite a extrait un `Settings-*.css` (ou un
   CSS partagé) chargé dynamiquement au moment de l'import du chunk — en
   WKWebView l'injection `<link>` du helper `__vitePreload` pourrait échouer
   silencieusement (style-src ? timing ?). Comparer `dist/assets/*.css` et ce
   que `index.html` référence ; regarder dans l'inspecteur si toutes les
   feuilles sont présentes sur la page noire.
2. **Quelque chose recouvre la page** : `.ur-overlay` (overlay usage) ou un
   autre overlay rendu par-dessus Settings dans le même bloc de App.tsx.
3. **État persisté** de l'app réelle (thème custom, vue au boot) absent des
   fixtures/goldens — tester l'app buildée avec un stockage vierge.
4. Peinture WKWebView (compositing) après montage lazy — tester en désactivant
   le lazy UNIQUEMENT pour Settings (import statique) pour isoler.

## Vérifications à exécuter après tout fix

```bash
npx tsc --noEmit && npx vite build && node scripts/check_entry_budget.mjs
npm run test:frontend          # 305 verts attendus
npm run test:visual            # 13 goldens (Chromium)
# rebuild app : suivre docs/PROTOCOLE_RELANCE.md À LA LETTRE (kills exhaustifs,
# touch src-tauri/src/lib.rs, vérif EMBED==DIST, taille binaire ~17,4 Mo)
```

Contraintes : ne pas toucher `gallery/assets/*`, la persistance, le sidecar,
CM6. Design system strict (voir CLAUDE.md). Ne pas pusher.

## Sondes temporaires à retirer une fois le bug réglé

- `index.html` : script inline « TEMPORAIRE (diagnostic 022) »
- `src/main.tsx` : fetch « entry-module-start » en tête de fichier
- `src/App.tsx` : `diag()` + sondes settings-import / settings-dom
- `src/components/LazyBoundary.tsx` : `componentDidCatch` (la balise fetch),
  garder la ligne `.lazy-error-detail` si jugée utile
