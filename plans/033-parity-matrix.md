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
| S-WS-SETTINGS | `getSettings` / `saveSettings` | settings.json | `ABSENT` |
| S-WS-IMAGE | `saveImage` / `generateImage` | pasted/ + project | `ABSENT` |
| S-WS-BROWSER | `checkFrame` / `scanLocal` | — | `ABSENT` |
| S-WS-TERM | `termOpen/Input/Resize/Close` | PTY | `ABSENT` |
| S-WS-THREADS | list/rename/move/delete/fork/import/export | threads.json | `ABSENT` |
| S-WS-SEND | `send` / `interrupt` / harness stream | harness-history | `ABSENT` |
| S-WS-HISTORY | `getHistory` | journal | `ABSENT` |
| S-WS-HIGHLIGHT | add/remove/list | highlights.json | `ABSENT` |
| S-WS-GIT | status/diff/stage/… | repo | `ABSENT` |
| S-WS-ZOTERO | search/digest/fav/… | sqlite + favs | `ABSENT` |
| S-WS-GOAL | goalSet/Get/Clear | provider | `ABSENT` |
| S-WS-QA | quickAsk / qaPromote | memory | `ABSENT` |
| S-WS-REVIEW | requestReview | — | `ABSENT` |
| S-WS-INTERACT | permission/interactionResponse | waiters | `ABSENT` |
| S-WS-CODEX | compact/clear | session | `ABSENT` |

## Galerie — routes HTTP (Node `gallery/server`)

| id | method | path | state | Node | cmux Rust | Atelier Rust | statut |
|----|--------|------|-------|------|-----------|--------------|--------|
| G-PING | GET | `/ping` | — | yes | yes | — | `ABSENT` |
| G-HEALTH | GET | `/health` | — | yes | yes | — | `ABSENT` |
| G-STATE | GET/POST | `/state` | `.fig_state.json` | yes | yes | — | `ABSENT` |
| G-DATA | GET | `/data` | `figures_data.json` | yes | yes | — | `ABSENT` |
| G-LS | GET | `/ls` | — | yes | yes | — | `ABSENT` |
| G-RAW | GET | `/raw` | — | yes | yes | — | `ABSENT` |
| G-SNIPPET | GET | `/snippet` | — | yes | yes | — | `ABSENT` |
| G-THUMB | GET | `/thumb` | `.fig_thumbs/` | yes | yes | — | `ABSENT` |
| G-RESCAN | POST | `/rescan` | figures_* | yes | yes | — | `ABSENT` |
| G-PDFANNOT | GET/POST | `/pdfannot` | pdf_annots.json | yes | yes | — | `ABSENT` |
| G-QUOTE | GET/POST | `/quote` | fig-last-quote | yes | partial | — | `ABSENT` |
| G-SELINFO | POST | `/selinfo` | fig-selection.json | yes | yes | — | `ABSENT` |
| G-SAVE-ANNOT | POST | `/save` | annotations/ | yes | partial | — | `ABSENT` |
| G-VERSIONS | GET/POST | `/versions` | dv_versions/ | yes | yes | — | `ABSENT` |
| G-GIT-* | GET/POST | githead/log/show/commit | git | yes | yes | — | `ABSENT` |
| G-CODE | GET/POST | `/code` `/codesave` | files | yes | yes | — | `ABSENT` |
| G-LATEX | POST | `/compile` `/synctex` | aux | yes | yes | — | `ABSENT` |
| G-SVG | POST | `/save-svg` `/export-png` | svg+edits | yes | yes | — | `ABSENT` |
| G-EXPORT | POST | `/export` `/delete` `/open` | trash/export | yes | yes | — | `ABSENT` |
| G-BOARD | GET/POST | `/board/*` `/notes/*` | board+notes | yes | yes | — | `ABSENT` |
| G-ZOTERO | GET | `/zotero/:key/:f` | storage | yes | yes | — | `ABSENT` |
| G-STATIC | GET | `/*` assets | — | yes | yes | — | `ABSENT` |

Référence cmux-gallery Rust : `/Users/tofunori/Documents/cmux-gallery/rust` (~70 routes portées).  
Stratégie : brancher ce noyau en Porte 2 (path-dep temporaire ou crate partagée).

## Fichiers d'état (profil utilisateur)

| id | chemin | writer Node | statut Rust |
|----|--------|-------------|-------------|
| ST-THREADS | `…/atelier-studio/threads.json` | ThreadStore | `ABSENT` |
| ST-HIGHLIGHTS | `…/highlights.json` | HighlightStore | `ABSENT` |
| ST-SETTINGS | `…/settings.json` | get/saveSettings | `ABSENT` |
| ST-UI | `…/ui.json` | /uistate | `RUST_R1` |
| ST-API | `…/api_providers.json` | openai_api | `ABSENT` |
| ST-HARNESS | `…/harness-history/*.jsonl` | harness journal | `ABSENT` |
| ST-LEDGER | `…/ledger/*.jsonl` | ledger | `ABSENT` |
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
