# Plan 068 : Provider dsh — l'agent DeepSeek dans le chat (harnais complet)

> **Executor instructions** : 3 phases livrables séparément, chacune avec son
> cycle exécution→revue. La phase A est autonome et utilisable seule. Méthode
> éprouvée (plan 045, kimi) : **les formes wire vérifiées font foi** — tout
> mapping s'écrit contre une capture réelle, jamais contre la doc seule.

## Status

- **Priority**: P3 (confort/expansion — après le lot réglages en cours)
- **Effort**: M (phase A ≈ 2-4 jours ; B+C incrémentales)
- **Risk**: MED (protocole dsh non gelé — 0.1.1-rc.2)
- **Depends on**: rien de bloquant ; réutilise `atelier-providers` tel quel
- **Category**: feature / provider
- **Planned at**: 2026-08-23, branche `feat/reglages-lot1-coquille`

## Why this matters

Le DeepSeek actuel d'Atelier (`openai_api`) est le **modèle nu** : il répond,
il ne travaille pas. Le harnais officiel DeepSeek (`dsh`,
`@deepseek-ai/dsh`, repo `deepseek-ai/deepseek-harness`) fournit l'agent
complet — bash, édition de fichiers, sous-agents, skills, sessions persistées,
compaction, plan mode, contexte 1M — et son flux d'événements est capturable
par un client loopback sans auth. Un provider `dsh` ferait de DeepSeek le
5e agent du chat, au même titre que claude/codex/grok/kimi.

Avantages mesurés au spike : raisonnement **en clair** dans le stream
(contrairement au thinking chiffré du CLI claude) et usage **réel par step**
(input/output/cacheRead/reasoning tokens — pas le placebo assistant).

## Contrat wire vérifié (spike 2026-08-23, dsh 0.1.1-rc.2, port 3080)

Capture brute : session live contre `dsh web`, prompt réel, tour complet
jusqu'à `turn/end` (avec appel d'outil `skill` spontané). Formes vérifiées :

**RPC unaire** — `POST /api/<method>`, enveloppe :
```json
{"type":"client-request","rpcId":"<uuid>","method":"session.prompt","payload":{…}}
→ {"type":"server-response","rpcId":"<même uuid>","result":{"ok":true,"value":{…}}}
```
Méthodes utiles : `host.describe` (probe), `session.create {cwd}` →
`{sessionId}`, `session.prompt {sessionId, mode:"queue"|"steer",
content:[{type:"text",text}|{type:"image",mediaType,data}]}`,
`session.cancel {sessionId}`, `session.models {sessionId}`,
`session.selectModel {sessionId, provider, model, reasoningEffort}`,
`session.history`, `session.fork`. Le flux d'approbations répond sur
`POST /api/respond` (ServerRequest → client-response, cf. pending table).

**Stream** — WebSocket `ws://127.0.0.1:<port>/api/events.mux`, downlink seul,
un message texte = un ServerRequest dont `payload` est un MuxFrame :
- `{type:"session/event", sessionId, event:{type,seq,time,data}, view?}` —
  le `view` optionnel porte le **libellé lisible** de l'outil
  (`dsh-agent-tool-presentation`) ;
- `{type:"approval/requested", sessionId, approvalId, toolName, callId?, reason?}`
  et `approval/resolved {outcome}` ;
- `{type:"question/requested", …}` (AskUser) ;
- `session/subscribed`, `session/queue`, `session/projection {key,value}`
  (clés vues : `title`, `sessionStats`, `contextBreakdown`,
  `contextPressure {contextWindow:1000000}`).

Événements de session observés (types `event.type`) : `turn/start`,
`step/start`, `user/message`, `request/header`, `request/context`,
`assistant/chunk`, `assistant/message`, `tool/call`, `step/end`, `turn/end`,
`llm/retry {retry,maxRetries,delayMs,failure}`, `llm/retry-started`,
`session/title`. Chunks `assistant/chunk.data.chunk.type` :
`block-start {index, blockType: reasoning|text|tool-call}`,
`reasoning-delta {index,text}`, `text-delta {index,text}`,
`block-end {index, block}` (le block `tool-call` porte `{id,name,arguments}`),
`usage {inputTokens,outputTokens,cacheReadTokens,reasoningTokens}`,
`finish {reason:{kind: stop|tool-calls|error}}`.

Sécurité d'accès : la fence `/api` accepte les clients **loopback** non
navigateur sans déclaration (`api-request-trust`). Pas de TLS/auth — rester
sur 127.0.0.1, jamais `--host 0.0.0.0`.

## Décisions d'architecture

1. **Épingler la version exacte** de dsh (installation dédiée, pas `npx`
   latest) : le protocole est explicitement interne et rc. Vendoriser la
   commande de lancement (`npx -y @deepseek-ai/dsh@0.1.1-rc.2 web` ou install
   locale sous `~/Library/Application Support/atelier/dsh/`) et **refuser de
   démarrer** si `host.describe.version` ne correspond pas à la version testée
   (échec bruyant plutôt que mapping silencieusement faux).
2. **Un serveur dsh partagé par provider** (pas un par fil) : spawn paresseux
   de `dsh web --port 0 --no-open` au premier tour, port lu depuis stdout,
   sessions dsh ↔ fils Atelier via `sessionId` (persisté comme les
   `session_id` claude). Reprendre les pièges du process partagé ACP
   (plan 045) : spawn **single-flight**, identité de process par génération
   sur exit/stdout.
3. **UI dsh jamais montrée** — `--no-open` ; le port reste un détail interne
   (utile en debug : ouvrir `http://127.0.0.1:<port>` à la main).
4. **Modèles via `session.models`/`session.selectModel`** : le sélecteur
   d'Atelier liste les groups retournés (deepseek-v4-pro/flash/…,
   reasoningEffort off/low/high/max mappé sur `effort` de `SendRequest`).
5. **Clé API** : dsh lit `DEEPSEEK_API_KEY` (ou credentials internes). Le
   provider passe l'env au spawn ; ne jamais journaliser la clé.

## Phase A — Provider minimal streamant (M)

Nouveau `rust/crates/atelier-providers/src/dsh.rs` (+ `dsh_map.rs`,
`dsh_rpc.rs` si utile de séparer), enregistré dans `registry.rs`.
`ProviderCaps { resume: true, steering: true (mode:"steer"), queue: true,
goals: false, tools: true }`.

Mapping cœur (comparer champ par champ avec `src/lib/ws.ts` AVANT d'émettre —
piège documenté : le frontend ne se défend pas) :

| dsh | AgentEvent |
|---|---|
| `text-delta` | `delta` |
| `reasoning-delta` | `thinking_delta` |
| `block-end` (text) | `text` (bulle finale du step) |
| `block-end` (reasoning) | `thinking` |
| `block-start`/`block-end` tool-call + `tool/call`… | `tool` puis `tool_update` — **`output` string REQUIS**, `view` → libellé |
| chunk `usage` | `usage` (context = contextBreakdown, output cumulé) |
| `turn/end` | `done` |
| `finish {kind:"error"}` / `agent/error` | `error` |
| `session/projection title` | titre du fil (mécanisme existant) |

Règles transverses : événements fréquents (`projection`, chunks bruts
retransmis) → `__ephemeral: true` ; tout contenu de fichier transitant dans un
event passe par la redaction du journal (piège snippets 2026-07-16) ; le
reducer frontend tolère les events intercalés (adjacence non requise depuis
d8efe37) mais bufferiser le reasoning par bloc reste plus propre
(cf. `makeTurnEmitter`).

Annulation : `is_cancelled` → `session.cancel`. Reprise : re-attacher au
`sessionId` existant (les sessions dsh sont persistées) ; `fork_pending` →
`session.fork`.

**Tests** : fixture wire figée depuis la capture du spike (même méthode que
`parity_kimi_send`) ; test de mapping chunk→AgentEvent pur ; config injectée
sur la struct, **jamais `env::set_var`** (piège course). `npx tsc --noEmit` +
`npx vite build` verts.

**Done** : un fil DeepSeek complet dans l'app réelle — prompt → thinking en
direct → outils visibles → réponse → usage — avec annulation qui fonctionne.

## Phase B — Interactions : approbations, questions, modèles (S)

- `approval/requested` → event `permission {requestId, toolName, input}` ;
  réponse du dialogue Atelier → `POST /api/respond` (allow/reject). Mapper
  `permission_mode` d'Atelier sur la politique d'approbation dsh si exposée.
- `question/requested` (AskUser) → `interaction` existant.
- `session.models`/`selectModel` branchés sur le sélecteur de modèle + effort.
- Images : `content [{type:"image", mediaType, data}]` depuis `inputs`.

**Done** : une commande bash demandée par dsh s'approuve depuis l'UI Atelier ;
changement de modèle/effort effectif en cours de fil.

## Phase C — Raffinements de rendu (S, incrémental)

1. `llm/retry` → `activity` (« Nouvelle tentative (n/5)… »), `__ephemeral`.
2. Libellés `view` systématiques sur les cartes d'outils.
3. Séparateurs de steps dans `Chat.tsx` (optionnel, design system : 4 niveaux
   de gris, pas de nouveau gris).
4. Subagents : premier jet = carte d'outil avec sortie (comme Task claude) ;
   itération suivante = fil déroulable via `subagent.history` (composant
   générique, profite à tous les harnais).

## Risques & mitigations

- **Protocole rc non gelé** → version épinglée + garde `host.describe` +
  fixtures wire qui cassent bruyamment à la mise à jour.
- **dsh découvre les skills/config de l'utilisateur** (observé au spike : il a
  invoqué un skill local spontanément) → décider du `cwd` de session (racine
  projet du fil, comme les autres providers) et documenter ce comportement.
- **Process orphelin** → tuer le serveur dsh au shutdown (protocole de relance :
  l'ajouter à la liste kill de PROTOCOLE_RELANCE.md quand la phase A atterrit).
- **Journal qui gonfle** → `__ephemeral` sur projections/chunks, vérifier
  `kinds.rs` (durable vs éphémère).

## Hors périmètre

- Multi-provider dans dsh (pi-ai vers OpenAI/self-hosted) : possible par
  config plus tard, aucun code Atelier requis.
- Rendu de l'UI dsh (iframe) : rejeté — décision 2026-08-23, option B
  (harnais headless, rendu Atelier).
- Goals/plan-mode dsh : à évaluer après la phase B.
