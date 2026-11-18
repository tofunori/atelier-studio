# Plan 081 — Lecture/édition `.ipynb` et moteur Jupyter ZeroMQ complet dans Atelier

## 1. Contexte et objectifs

Intégrer dans Atelier Studio une prise en charge native et complète des cahiers **Jupyter Notebook (`.ipynb`)** respectant strictement la règle **Rust-first** (`CLAUDE.md`, zéro dépendance Node.js runtime ni serveur Python `jupyter-server` intermédiaire) et l'esthétique **Quiet Instrument / Precision Native** validée sur maquette :

1. **Surface éditoriale `.ipynb` sobre et sans perte (`nbformat` v4.0–4.5)** :
   - Prose Markdown et équations KaTeX rendues sans cadre au repos ;
   - Puits de code tonals (`--surface-inset`) **sans aucune barre verticale orange en marge**, retour à la ligne intégral (`white-space: pre-wrap; overflow-wrap: anywhere`), focus discret par simple liseré neutre `1px` (`--border-default`) et assombrissement du numéro de cellule (`tabular-nums`) ;
   - Tables scientifiques style *booktabs* (DataFrames Pandas/Polars, résumés ArviZ/xarray) assainies contre toute injection XSS ou feuille `<style>` globale ;
   - Figures `SVG`/`PNG`/`JPEG` dotées d'une table lumineuse plein panneau, d'un enregistrement atomique dans la galerie du projet et d'une citation directe au chat ;
   - Bascule instantanée entre **Cahier actif**, **Lecture seule (`0 Mo`)** et **Diff Git cellule par cellule** contre `HEAD`.

2. **Moteur d'exécution Jupyter complet en Rust pur (ZeroMQ ZMTP 3.x sur 5 canaux)** :
   - Implémentation asynchrone native (`tokio::net::TcpStream`) du transport **ZMTP 3.0 / 3.1 (RFC 37)** (`DEALER`, `ROUTER`, `SUB`, `PUB`, `REQ`, `REP`) et du **Jupyter Messaging Protocol v5.3** signé en `HMAC-SHA256` (temps constant) ;
   - Découverte unifiée des `kernelspec` Jupyter (`ipykernel` Pixi/Conda/`.venv`, `IRkernel`, `IJulia`) et des environnements Python d'Atelier (`atelier_kernel::discover_envs_with`), avec repli automatique transparent sur `atelier_noyau.py` lorsqu'un environnement Python léger ne dispose pas d'`ipykernel` ;
   - Inspection silencieuse des variables en mémoire (`user_expressions` avec `silent: true`, sans incrémenter `In [n]`), autocomplétion `Tab` (`complete_request`), mesure RSS par groupe de processus et interruption `SIGINT` + canal `control`.

3. **Conscience intégrale du cahier (amont + aval) pour les modèles du chat** :
   - Publication temps réel du contexte vivant (`kind: "notebook"`, cellule focalisée `[k]` sur `N`) ;
   - Outil MCP dédié **`atelier_notebook`** projetant l'ensemble du cahier sans `base64` (~95 % d'économie de jetons), analysant statiquement les imports amont (`[1..k-1]`) et les symboles consommés en aval (`[k+1..N]`), et soumettant des révisions en **mini-diff inline** (`SURF-17`, lavis 14 %) que seul l'utilisateur accepte (`Accepter et exécuter` / `Accepter` / `Écarter`).

---

## 2. Architecture détaillée par couche

### A. Crate Rust `rust/crates/atelier-notebook` (zéro nouvelle dépendance externe)

| Module | Responsabilité |
| --- | --- |
| `src/nbformat.rs` | Lecture/écriture sans perte `nbformat` v4 (`extra` `BTreeMap` préservant `metadata`, `attachments`, clés Jupytext/Quarto/Colab), écriture atomique, nettoyage ANSI, gestion de `\r` (`tqdm`) et `update_display_data` (`transient.display_id`). |
| `src/zmtp.rs` | Transport ZeroMQ ZMTP 3.0/3.1 asynchrone sur TCP local : salutation 64 octets, trames courtes/longues 64 bits, commandes `READY` (`Socket-Type`, `Identity`) et `PING`/`PONG`. |
| `src/wire.rs` | Enveloppe Jupyter v5.3 (`<IDS\|MSG>`), `HMAC-SHA256` RFC 2104 vérifié sur vecteurs RFC 4231, comparateur en temps constant, constructeurs `execute_request`, `complete_request`, `inspect_request`, `interrupt_request`, `shutdown_request` et `PYTHON_VARIABLES_EXPR`. |
| `src/kernelspec.rs` | Découverte croisée des environnements Python Atelier et des `kernel.json` système/utilisateur/environnement (`ZmqKernelspec` prioritaire, repli `AtelierPythonFallback`). |
| `src/context.rs` | Projection agent sans `base64`, détection des exécutions hors ordre (`outOfOrderCells`), analyse statique Python/R/Julia (`analyze_neighborhood`, `validate_proposed_code` signalant les ré-imports redondants et les variables aval brisées), et diff LCS cellule par cellule (`diff_notebooks`). |
| `src/proposals.rs` | Modèle `CellProposal` (`Edit`, `InsertAfter`, `Delete`) avec diff ligne à ligne, résumés amont/aval et diagnostics statiques. |
| `src/session.rs` | `NotebookManager` et `NotebookWorkspace` : connexion concurrente aux 5 sockets ZMQ (`shell`, `iopub`, `stdin`, `control`, `hb`), sérialisation d'exécution par cahier (`exec_gate`), suivi RSS et diffusion `NotebookPushEvent`. |

### B. Schéma MCP et pont Runtime (`atelier-agent-mcp` & `atelier-runtime`)

- **`rust/crates/atelier-agent-mcp/src/schema.rs`** :
  - Déclaration de `atelier_notebook` (`actions` : `read`, `neighborhood`, `propose_edit`, `propose_insert`, `withdraw_proposal`, `kernels`) avec routage `route_tool_call`.
- **`rust/crates/atelier-runtime/src/notebook_tool.rs`** :
  - Validation stricte d'appartenance au projet (`canonicalize` + `starts_with`) empêchant toute traversée `..` ou lien symbolique sortant ;
  - Contrôle de révision optimiste (`expectedRevision`) sur `propose_edit` ;
  - Gestionnaires WebSocket `notebookCommand` (`open`, `save`, `runCell`, `runAll`, `restart`, `stopKernel`, `updateCell`, `insertCell`, `deleteCell`, `acceptProposal`, `discardProposal`, `complete`, `inspect`, `gitDiff`, `saveFigure`) et `notebookInterrupt`.
- **`live_context.rs`, `send.rs`, `ws_dispatch.rs`, `ws_router.rs`, `state.rs`** :
  - Extension `kind == "notebook"` (`cell`, `cellCount`), injection automatique du bloc `<atelier-notebook>` dans le prompt système du tour, classification `notebookCommand` en `Class::Read` (non bloquant pour le chat) et `notebookInterrupt` en `Class::Control`.

### C. Interface React et contrats Quiet Instrument (`src/`)

- **`src/lib/notebook.ts`** : client WebSocket typé, extracteur `notebookPathFromTabUrl`, et assainisseurs DOM `sanitizeNotebookHtml` / `sanitizeNotebookSvg` supprimant `<script>`, `<style>`, `<iframe>`, `<foreignObject>`, `on*` et `javascript:`.
- **`src/components/NotebookTab.tsx` & `src/components/NotebookTab.css`** :
  - Chargé paresseusement via `lazyWithRetry` dans `AtelierPane.tsx` (chunk séparé ~25 Ko, entrée principale maintenue sous le budget de 912 Ko) ;
  - Primitives `Button`, `IconButton`, `RowButton`, `SegmentedControl`, `LazyDropdownMenu` exclusivement (zéro `<button>` HTML nu) ;
  - Jetons publics de `tokens.css` uniquement, grille d'espacement de 4 px (demi-pas 2/6 px), `font-variant-numeric: tabular-nums`, lavis de diff `14 %` (`SURF-17`).
- **`src/App.tsx` & `src/components/AtelierPane.tsx`** :
  - Ouverture des `.ipynb` sur `ipynb_studio.html?path=…` (avec bascule « Voir le code source » vers `code_editor.html` dans le menu du volet et support natif de `&diff=1`), chrome natif fusionné (`ownsNativeChrome`) et relais `atelier-doc-live-context`.

---

## 3. Plan de vérification

1. **Tests unitaires et d'intégration Rust** :
   - `cargo test --manifest-path rust/Cargo.toml -p atelier-notebook -p atelier-agent-mcp -p atelier-runtime --locked`
   - Couvre : vecteurs `HMAC-SHA256`, aller-retour `nbformat` sans perte, serveur mock ZMTP 5 canaux complet, exécution Python réelle + acceptation de proposition, analyseur statique amont/aval, et barrière de sécurité hors projet.
2. **Vérification des types sur les 8 sous-projets TypeScript** :
   - `npm run typecheck:all`
3. **Contrats CSS Quiet Instrument et tests composants React** :
   - `npm run test:frontend` (incluant `css-contract.test.ts`, `NotebookTab.test.tsx`, `AtelierPane.liveContext.test.tsx`).
4. **Build de production et budget d'entrée** :
   - `npm run build:web && node scripts/check_entry_budget.mts`
   - `npm run check:backend-policy`
