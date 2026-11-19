# Campagne de bout en bout du cahier Jupyter

Teste l'onglet cahier comme dans l'app : le **vrai** serveur Rust
(`atelier-studio-server`), le **vrai** composant `NotebookTab` servi par Vite,
un **vrai** noyau ipykernel, piloté par Playwright (Chromium). Mac et Linux.

```sh
cargo build --manifest-path rust/Cargo.toml --bin atelier-studio-server
npm run test:notebook:e2e
```

Le script crée un projet temporaire avec un cahier d'essai et son `.venv`
(ipykernel + matplotlib, via pip). Variables utiles :

- `NB_E2E_VENV=<venv>` : réutiliser un venv qui a déjà ipykernel (pas de réseau) ;
- `ATELIER_SERVER_BIN=<binaire>` : un autre serveur (par défaut `rust/target/{debug,release}`) ;
- `NB_E2E_CHROMIUM=<chrome>` : un Chromium déjà installé quand la version de Playwright diffère ;
- `NB_E2E_VITE_PORT` : port de Vite (5198 par défaut).

Ce qui est vérifié : exécution simple et enchaînée, sortie progressive d'une
cellule longue, erreur Python lisible, figure matplotlib, la vue qui reste sur
la cellule relancée (ancrage du défilement coupé, comme WKWebView sur Mac),
sélection envoyée au chat avec la capsule commune, `input()`, interruption,
redémarrage, « Tout exécuter » qui s'arrête à l'erreur, `display(HTML)`,
aucune erreur JS.

Puis un second projet dont le `.venv` n'a ni ipykernel ni IPython (ses paquets
sont reliés à ceux du premier) : Atelier y prend son noyau de secours
(`atelier_noyau.py`), qui doit se comporter comme Jupyter : `display()` sans
import, `IPython.display` (HTML, Markdown), `plt.show()` en ligne, figure
restée ouverte affichée en fin de cellule, `_repr_html_`, `;` final, `!commande`.

Le noyau qui ne démarre pas est couvert côté Rust
(`rust/crates/atelier-notebook/tests/noyau_qui_ne_demarre_pas.rs`).

Le banc lui-même (`harness.html`) se lance aussi à la main pour regarder :
`npx vite --config tests/notebook-e2e/vite.config.mts`, puis
`/tests/notebook-e2e/harness.html?port=<port du serveur>&token=<ATELIER_TOKEN>&path=<cahier>&root=<projet>&theme=dark&noanchor=1`.
