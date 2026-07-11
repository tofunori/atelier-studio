# Plan 033 — Matrice de parité fonctionnelle (Porte 0)

> Inventaire généré 2026-07-11 depuis le code vivant.  
> Statuts: `PARITY` | `PARTIAL` | `ABSENT` | `NODE_ONLY` | `RUST_R1` | `N/A`  
> Bascule production interdite tant qu'une ligne **requise** n'est pas `PARITY`.

## Légende des statuts

| Statut | Sens |
|--------|------|
| `PARITY` | Comportement Node et Rust identiques + tests verts |
| `PARTIAL` | Implémenté partiellement côté Rust (forme OK, sémantique incomplète) |
| `ABSENT` | Pas encore porté en Rust |
| `NODE_ONLY` | Existe uniquement en Node (référence) |
| `RUST_R1` | Surface minimale livrée en R1 (squelette) |
| `N/A` | Hors scope du domaine |

## R1 livré (Porte 1)

| id | capacité | surface | UI / client | persistance | test | statut |
|----|----------|---------|-------------|-------------|------|--------|
| S-HTTP-HEALTH | GET `/health` shape sidecar | HTTP | Tauri identity | — | `atelier-runtime` unit | `RUST_R1` |
| S-HTTP-PROVIDERS | GET `/providers` catalogue | HTTP | Composer picker | — | unit | `PARTIAL` (static, no bin probe) |
| S-HTTP-SETUP | GET `/setup` | HTTP | Réglages / debug | — | — | `PARTIAL` |
| S-HTTP-UISTATE-GET | GET `/uistate` | HTTP | Projects/settings share | `ui.json` | unit | `RUST_R1` |
| S-HTTP-UISTATE-POST | POST `/uistate` | HTTP | idem | `ui.json` atomic | unit | `RUST_R1` |
| S-WS-PING | WS `ping` → `pong` | WebSocket | reconnect keepalive | — | unit | `RUST_R1` |
| S-WS-UNKNOWN | WS type inconnu → error | WebSocket | — | — | unit | `RUST_R1` |
| S-AUTH-HTTP | header `x-atelier-token` | HTTP | all clients | env token | unit | `RUST_R1` |
| S-AUTH-WS | query `?token=` | WebSocket | frontend | env token | (manual) | `RUST_R1` |
| S-LIFECYCLE-PID | `sidecar.pid` atomic | process | single-instance | pid file | unit | `RUST_R1` |
| S-LIFECYCLE-LOCK | `sidecar.lock` (opt) | process | Tauri reuse | lock file | unit write | `RUST_R1` |
| S-LIFECYCLE-DEFER | same-bundle defer | process | no kill loop | — | unit none-path | `PARTIAL` |
| S-SELECTOR | `ATELIER_BACKEND=node\|rust` | Tauri spawn | env | — | cargo check | `RUST_R1` |

## Sidecar — WebSocket message types (Node reference)

Inventaire exhaustif depuis `sidecar/router.mjs`. Statut global R1 : hors `ping` → `ABSENT`.

| id | type client | réponse / effet | statut |
|----|-------------|-----------------|--------|
| S-WS-PING | `ping` | `pong` | `RUST_R1` |
| S-WS-HELLO | `clientHello` | store clientInstanceId | `ABSENT` |
| S-WS-STATUS | `status` | port/pasted | `ABSENT` |
| S-WS-PROVIDER | `providerStatus` | providers | `ABSENT` |
| S-WS-SETUP | `setupStatus` | setup | `ABSENT` |
| S-WS-API-* | `apiProviders` / save / list / delete | api_providers.json | `ABSENT` |
| S-WS-PASTED | `clearPasted` / `listPasted` | pasted/ | `ABSENT` |
| S-WS-SETTINGS | `getSettings` / `saveSettings` | settings.json | `PARITY` (R3) |
| S-WS-IMAGE | `saveImage` / `generateImage` | pasted/ + project | `ABSENT` |
| S-WS-BROWSER | `checkFrame` / `scanLocal` | — | `ABSENT` |
| S-WS-TERM | `termOpen/Input/Resize/Close` | PTY | `ABSENT` |
| S-WS-THREADS | list/rename/move/delete/upsert | threads.json | `PARITY` (R3; fork/import later) |
| S-WS-SEND | `send` / `interrupt` / harness stream | harness-history | `PARTIAL` (R5 fake only) |
| S-WS-PROV | `providerStatus` / `status` | — | `PARITY` (R5) |
| S-WS-HISTORY | `getHistory` | journal materialize | `PARTIAL` (no provider loaders) |
| S-WS-HIGHLIGHT | add/remove/list | highlights.json | `PARITY` (R3) |
| S-WS-LEDGER | `getLedger` | ledger/*.jsonl | `PARITY` (R3) |
| S-WS-GIT | status/diff/stage/commit/push/pull/… | repo | `PARITY` (R4) |
| S-WS-TERM | termOpen/Input/Resize/Close | PTY | `PARITY` (R4) |
| S-WS-FILES | listFiles/listCommands | git ls-files | `PARITY` (R4) |
| S-WS-PASTED | saveImage/list/clear | pasted/ | `PARITY` (R4) |
| S-WS-SCAN | scanLocal/checkFrame | loopback | `PARITY` (R4) |
| S-WS-ZOTERO | search/collections/fav/digest | sqlite + favs | `PARTIAL` (no add PDF) |
| S-WS-GOAL | goalSet/Get/Clear | provider | `ABSENT` |
| S-WS-QA | quickAsk / qaPromote | memory | `ABSENT` |
| S-WS-REVIEW | requestReview | — | `ABSENT` |
| S-WS-INTERACT | permission/interactionResponse | waiters | `ABSENT` |
| S-WS-CODEX | compact/clear | session | `ABSENT` |

## Galerie — routes HTTP (Node `gallery/server`)

Statut R2 (2026-07-11) : binaire `atelier-gallery-server` opt-in via
`ATELIER_GALLERY_BACKEND=rust`. Production reste Node.

| id | method | path | state | Node | Atelier Rust R2 | statut |
|----|--------|------|-------|------|-----------------|--------|
| G-PING | GET | `/ping` | — | yes | yes (fig-annotate) | `PARITY` |
| G-HEALTH | GET | `/health` | — | yes | yes (atelier-gallery + identity) | `PARITY` |
| G-STATE | GET/POST | `/state` | `.fig_state.json` | yes | yes | `PARITY` |
| G-DATA | GET | `/data` | `figures_data.json` | yes | yes | `PARITY` |
| G-LS | GET | `/ls` | — | yes | yes | `PARITY` |
| G-RAW | GET | `/raw` | — | yes | yes | `PARITY` |
| G-SNIPPET | GET | `/snippet` | — | yes | yes | `PARITY` |
| G-THUMB | GET | `/thumb` | `.fig_thumbs/` | yes | yes | `PARITY` |
| G-RESCAN | POST | `/rescan` | figures_* | yes | yes (native builder) | `PARITY` |
| G-PDFANNOT | GET/POST | `/pdfannot` | pdf_annots.json | yes | yes | `PARITY` |
| G-QUOTE | GET/POST | `/quote` | fig-last-quote | yes | partial host-push | `PARTIAL` |
| G-SELINFO | POST | `/selinfo` | fig-selection.json | yes | yes | `PARITY` |
| G-SAVE-ANNOT | POST | `/save` | annotations/ | yes | partial host-push | `PARTIAL` |
| G-VERSIONS | GET/POST | `/versions` | dv_versions/ | yes | yes | `PARITY` |
| G-GIT-* | GET/POST | githead/log/show/commit | git | yes | yes | `PARITY` |
| G-CODE | GET/POST | `/code` `/codesave` | files | yes | yes | `PARITY` |
| G-FINDFILE | GET | `/findfile` | — | Studio only | yes | `PARITY` |
| G-LATEX | POST | `/compile` `/synctex` | aux | yes | yes | `PARITY` |
| G-SVG | POST | `/save-svg` `/export-png` | svg+edits | yes | yes | `PARITY` |
| G-EXPORT | POST | `/export` `/delete` `/open` | trash/export | yes | yes | `PARITY` |
| G-BOARD | GET/POST | `/board/*` `/notes/*` | board+notes | yes | yes | `PARITY` |
| G-ZOTERO | GET | `/zotero/...` | storage | yes | yes (path shape may differ) | `PARTIAL` |
| G-STATIC | GET | `/*` assets | — | yes | yes | `PARITY` |
| G-TOKEN | boot | `~/.atelier-studio/gallery_token` | file | yes | yes (ATELIER_STUDIO=1) | `PARITY` |
| G-SELECTOR | Tauri | `ATELIER_GALLERY_BACKEND` | — | n/a | yes | `RUST_R1` |

Référence amont : `/Users/tofunori/Documents/cmux-gallery/rust` (copie sous `rust/crates/`).

## Fichiers d'état (profil utilisateur)

| id | chemin | writer Node | statut Rust |
|----|--------|-------------|-------------|
| ST-THREADS | `…/atelier-studio/threads.json` | ThreadStore | `PARITY` (R3) |
| ST-HIGHLIGHTS | `…/highlights.json` | HighlightStore | `PARITY` (R3) |
| ST-SETTINGS | `…/settings.json` | get/saveSettings | `PARITY` (R3) |
| ST-UI | `…/ui.json` | /uistate | `RUST_R1` |
| ST-API | `…/api_providers.json` | openai_api | `ABSENT` |
| ST-HARNESS | `…/harness-history/*.jsonl` | harness journal | `PARITY` (R3 read/write/materialize) |
| ST-LEDGER | `…/ledger/*.jsonl` | ledger | `PARITY` (R3) |
| ST-PASTED | `…/pasted/` | saveImage | `ABSENT` |
| ST-ZFAV | `…/zotero-favs.json` | zoteroFav | `ABSENT` |
| ST-PID | `…/sidecar.pid` | Node | `RUST_R1` |
| ST-LOCK | `…/sidecar.lock` | Tauri | `RUST_R1` (self-write opt) |

## Projet galerie

| id | chemin | statut |
|----|--------|--------|
| GP-STATE | `$PROJECT/.fig_state.json` | `ABSENT` |
| GP-DATA | `$PROJECT/figures_data.json` | `ABSENT` |
| GP-INDEX | `$PROJECT/figures_index.html` | `ABSENT` |
| GP-THUMBS | `$PROJECT/.fig_thumbs/**` | `ABSENT` |
| GP-VERSIONS | `.fig_thumbs/dv_versions/*.json` | `ABSENT` |
| GP-BOARD | `.fig_thumbs/board.tldr.json` | `ABSENT` |
| GP-NOTES | `notes.md` | `ABSENT` |
| GP-ANNOT | `annotations/*` | `ABSENT` |

## Prochaines portes (rappel)

1. **Porte 2** — galerie Rust via cmux-gallery crates, assets `gallery/assets/`
2. **Porte 3** — threads/history/journal/ledger/highlights
3. **Portes 4–8** — workspace, harness, providers
4. **Portes 9–11** — routeur, défaut Rust, soak, retrait Node

## Comment mettre à jour

Après chaque lot : recalculer les statuts, ajouter tests, jamais marquer `PARITY` sans preuve (unit + HTTP + app buildée pour les parcours visibles).
