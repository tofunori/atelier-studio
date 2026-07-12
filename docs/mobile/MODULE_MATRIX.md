# Matrice modules — réutiliser / adapter / interdire (mobile MVP)

Commit de référence : `0fbfc7a`.
Légende : **R** = réutiliser, **A** = adapter, **I** = interdire sur mobile MVP,
**N** = nouveau (à écrire).

## Frontend TypeScript

| Module | Chemin | Décision | Motif |
|--------|--------|----------|-------|
| Types harnais / AgentEvent | `src/lib/ws.ts` (types) | **R** → package partagé | Contrat 025 ; source de vérité actuelle |
| connectSidecar / SendOptions helpers | `src/lib/ws.ts` (IO) | **A** / **I** loopback | Remplacer par transport gateway |
| getClientInstanceId | `src/lib/ws.ts` | **A** | Id appareil stable Keychain, pas sessionStorage |
| harnessEvents reducer | `src/lib/harnessEvents.ts` | **R** | Live≡replay testé |
| useSidecarConnection | `src/hooks/useSidecarConnection.ts` | **A** | Machine d’état F plus riche |
| sidecarInfo / headers | `src/lib/sidecarInfo.ts` | **I** | Invoke + token session Mac |
| uiStateWriteThrough | `src/lib/uiStateWriteThrough.ts` | **I** | Profil Mac partagé |
| ipc gallery | `src/lib/ipc.ts` | **I** | Origin loopback iframe |
| providers catalog UI | `src/lib/providers.ts` | **A** | Lecture via gateway, pas setup bin |
| statusPresentation | `src/lib/statusPresentation.ts` | **R** | Présentation pure |
| markdown helpers | `src/lib/markdown.ts` | **R**/**A** | Perf stream |
| themes | `src/lib/themes.ts` | **A** | Dark iOS d’abord |
| i18n | `src/lib/i18n.ts` | **A** | Sous-ensemble chaînes mobile |
| notify / dock badge | `src/lib/notify.ts`, `dockBadge.ts` | **I** → **N** natif | Notifications iOS |
| lruCache | `src/lib/lruCache.ts` | **R** | Cache projection |
| researchHome | `src/lib/researchHome.ts` | **I** MVP | Desktop home |
| settings | `src/lib/settings.ts` | **A** minimal | Pairing / diagnostics |
| App.tsx monolithe | `src/App.tsx` | **I** | Couplage desktop total |
| main.tsx boot | `src/main.tsx` | **I** | uistate loopback |
| ChatTimeline | `src/components/chat/ChatTimeline.tsx` | **A** | Virtualisation + modes scroll |
| turns / turnParts / turnAnatomy | `chat/turns*.tsx` | **A** | Extraire présentation |
| Composer / PromptInput / ContextShelf | `chat/*` | **A** | Clavier / haptique |
| HarnessInteraction | `chat/HarnessInteraction.tsx` | **R**/**A** | UI tactile 44pt |
| md.tsx / mathIdle | `chat/md.tsx` | **A** | Promote idle renforcé |
| toolPresentation | `chat/toolPresentation.tsx` | **R**/**A** | |
| Rail / TopBar / Projects | `components/*` | **I** → **N** | Nav mobile tabs |
| AtelierPane / gallery iframe | `components/AtelierPane*` | **I** | |
| Terminal / Browser / Git / Biblio / Generator | surfaces | **I** | Hors MVP |
| Settings page desktop | | **I** → **N** réglages mobile | |
| tokens.css / primitives | `src/styles/*` | **R** | Anti-dérive |
| App.css valeurs couleur | `src/App.css` | **R** (valeurs) | Pas le monolithe CSS entier |

## Tauri / native Mac

| Module | Décision | Motif |
|--------|----------|-------|
| `start_atelier` / gallery spawn | **I** | Mac only |
| `sidecar_port` / session token | **I** | |
| browser_* commands | **I** | |
| badge Dock | **I** | |
| dialog / opener desktop | **I** / partiel share iOS | |
| `mobile_entry_point` flag | **A** | Point d’entrée futur workspace mobile |
| capabilities default.json | **I** copy | Capabilities iOS minimales dédiées |
| CSP loopback | **I** copy | CSP gateway HTTPS |
| icons/ios | **R** | Assets |

## Rust / sidecar

| Module | Décision | Motif |
|--------|----------|-------|
| `atelier-protocol` | **A** (élargir) | Enveloppes + version |
| `atelier-runtime` server bind | **R** loopback | Ne pas ouvrir le réseau |
| `ws_router` surface complète | **I** exposer | Gateway white-list |
| harness / providers / send | **R** via proxy | Moteur reste Mac |
| store history / threads | **R** lecture | |
| workspace git/term/zotero | **I** mobile API | |
| `atelier-gallery` HTTP | **A** via gateway | Path policy stricte |
| path escape tests workspace | **R** patterns | Réutiliser idées anti-traversée |
| Gateway remote | **N** | Jalon C |
| Pairing / device tokens store | **N** | |
| UI Mac révocation appareils | **N** | Minimal |

## Gallery assets / viewers

| Module | Décision | Motif |
|--------|----------|-------|
| `gallery_template.html` full | **I** | Trop desktop |
| PDF.js bundle gallery | **A** ou natif iOS | Viewer G |
| diff/cm6 editors | **I** MVP | Lecture d’abord |
| annotations pipeline | **A** plus tard | Add-to-chat H/G |
| figures index API | **A** | Index paginé gateway |

## Docs / contrats

| Doc | Décision |
|-----|----------|
| `docs/AGENT_HARNESS_CONTRACT.md` | **R** — loi du journal |
| `docs/SECURITY.md` | **A** — addendum mobile |
| `docs/PROTOCOLE_RELANCE.md` | **R** desktop ; runbook mobile séparé (I) |
| Plans 025/033 | **R** dépendances |
| Plan 034 | **R** roadmap exécution |

## Synthèse quantitative (approx.)

| Décision | Count modules listés |
|----------|----------------------|
| **R** réutiliser | ~15 |
| **A** adapter | ~20 |
| **I** interdire | ~25 |
| **N** nouveau | ~8 |

Le ratio confirme : le mobile est un **client mince + gateway**, pas un port
de l’app Mac.
