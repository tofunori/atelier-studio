# gallery/ — galerie et éditeurs d'Atelier (côté navigateur)

Ce dossier est l'héritier vendorisé de **cmux-gallery** (ex-outil Python
autonome). Depuis le 2026-09-14 il ne contient plus aucun serveur : le backend
galerie est `atelier-gallery-server` (`rust/crates/atelier-gallery`), lancé
par l'app avec `ATELIER_ASSETS_DIR=gallery/assets`. Tout ce qui reste ici est
de l'interface (HTML/JS/TS exécutés dans la webview) ou de l'outillage.

## Contenu

| Dossier | Rôle |
|---|---|
| `assets/` | Ce que le serveur sert : `gallery_template.html` (coquille live), viewers (`pdf_viewer.html`, `svg_viewer.html`…), éditeurs (`latex_studio.html`, `code_editor.html`, `md_studio.html`), bundles construits (`cm6/`, `shadcn-ui/`, `*.bundle.js`). **Seul `assets/` est embarqué dans le `.app`** (`scripts/stage-gallery.sh`). |
| `src/studio/` | Sources TypeScript des éditeurs (surfaces LaTeX/code/markdown, cœur diff/versions). Bundlées par `scripts/build-cm6.mjs` (esbuild) vers `assets/cm6/`. |
| `react-ui/`, `notes-src/`, `whiteboard-src/` | Sources des UI React (barre de commandes, notes, tableau blanc), construites vers `assets/`. |
| `tests/unit/` | Tests Node (`node --test`) des assets : contrats d'éditeur, thème, plein écran, PDF, CSV… et `diff_suite.mjs` (obligatoire dès que `gallery/` change — voir `docs/PIEGES_CONNUS.md`). |
| `tests/e2e/` | Playwright (`npm run test:e2e`) contre le vrai serveur Rust, spawné par `tests/gallery_server.mjs`. |
| `tests/kb_parity/` | Contrat de la chaîne KB, rejoué contre `atelier-kb-rs` (`npm run test:kb:parity`). |
| `reapply_svg_edits.py` | Référence Python de l'algorithme de réapplication d'éditions SVG, porté en Rust (`atelier-core/src/svg_edits.rs`) ; ses 10 tests (`tests/test_reapply_edits.py`) documentent le comportement attendu. |

## Commandes utiles

```bash
npm run build:gallery-ui              # UI React → assets/shadcn-ui/
npm --prefix gallery run build:cm6    # éditeurs CM6 → assets/cm6/
node gallery/tests/unit/diff_suite.mjs
npm run test:gallery                  # unit + diff_suite + kb_parity
npm run verify:e2e                    # Playwright
```

Le serveur se lance à la main pour déboguer :

```bash
cargo run -p atelier-gallery --bin atelier-gallery-server -- --root <projet> --port 8790
# avec ATELIER_ASSETS_DIR=gallery/assets dans l'environnement
```

## Règles

- Le système de design du template suit `CLAUDE.md` (tailles 10/11/12/13/15,
  rayons 6/10, poids 500/600, menus `.menu`/`.mi`) — verrouillé par
  `tests/unit/theme_contract.test.mjs`.
- Modifier `assets/*` sans restager (`scripts/stage-gallery.sh`) = bundle
  périmé dans l'app ; la coquille est rendue en mémoire au boot du serveur
  (relancer le serveur pour voir un changement de template).
- Toute modif galerie se commit ICI, jamais dans `~/Documents/cmux-gallery`.
