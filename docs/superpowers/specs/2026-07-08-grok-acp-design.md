# Grok de 1re classe via ACP (`grok agent stdio`)

Date : 2026-07-08 · Statut : validé par Thierry · Implémentation : phase 1

## Contexte

Le provider `grok` actuel (`sidecar/providers/grok.mjs`) spawne `grok -p … --output-format
streaming-json`, qui n'émet que 4 events (`thought`/`text`/`end`/`error`). Conséquences :
aucune carte d'outil, usage figé à zéro, Stop no-op, historique perdu au reload (misrouting
vers `~/.codex/sessions`).

Sondes empiriques (grok CLI 0.2.91, 2026-07-08) : `grok agent stdio` implémente **ACP**
(Agent Client Protocol, agentclientprotocol.com) — JSON-RPC 2.0 **newline-delimited**
(pas de Content-Length). Vérifié en live : tool calls streamés avec diffs, tokens réels,
`session/cancel` propre, auth silencieuse via `~/.grok/auth.json`. Logs bruts de référence :
`scratchpad grok-stdio-probe/run3.log` (tour avec outil) et `run4.log` (cancel + queue) —
à convertir en fixtures.

## Objectif

Réécrire le provider grok sur `grok agent stdio` pour atteindre la parité d'expérience
avec Codex : cartes d'outils live + diffs, usage réel, Stop fonctionnel, resume/historique.

## Non-objectifs (phase 2)

Steering natif (`x.ai/interject`), permissions HITL bloquantes (`session/request_permission`),
affichage de la file (`_x.ai/queue/changed`), slash commands, rate limits (non exposés par le CLI).

## Architecture

### Process persistant (pattern `codex.mjs`)

- Un process `grok agent stdio` partagé, spawné paresseusement au premier tour, réutilisé.
- **Binaire** : préférer `~/.grok/bin/grok` (symlink auto-updaté) s'il existe et est exécutable,
  sinon `resolveBin("grok")` — évite le wrapper cmux (`/Applications/cmux.app/…/bin/grok`)
  qui injecte des hooks.
- Handshake à l'ouverture :
  ```json
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,
   "clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false}}}
  ```
  Capacités fs/terminal **false** : les outils tournent côté moteur (vérifié — namespace
  `opencode`), on évite d'avoir à servir `fs/read_text_file` etc. Toute requête entrante
  inattendue du serveur reçoit une erreur JSON-RPC `method not found` (jamais de silence,
  sinon le serveur peut bloquer).
- La réponse `initialize` donne `agentVersion` : la stocker ; au début de chaque tour,
  si le symlink pointe vers une autre version (ou si le process est mort), respawn.
- `stopServer()` exporté (kill + cleanup), comme codex.

### Sessions

- Par thread : `session/new` `{cwd: projectRoot, mcpServers: []}` → `sessionId` (UUID).
  NB : le moteur charge quand même la config MCP locale de l'utilisateur (~19 serveurs) —
  events `_x.ai/mcp/*` à ignorer, **ne jamais logger leur contenu** (credentials en env).
- Resume : `session/load` (capability `loadSession:true` confirmée) avec le sessionId
  existant ; pendant le load, le serveur peut rejouer des notifications `session/update`
  — les ignorer (l'app a déjà son historique), ne traiter que celles postérieures au
  `session/prompt` courant.
- Prompt : `session/prompt` `{sessionId, prompt:[{"type":"text","text":…}]}`.
  Réponse : `{stopReason, _meta:{totalTokens,inputTokens,outputTokens,cachedReadTokens,
  reasoningTokens,…}}`. `stopReason` observés : `end_turn`, `cancelled`.

### Mapping events ACP → kinds Atelier

Notifications `session/update`, discriminant `params.update.sessionUpdate` :

| ACP | kind Atelier |
|---|---|
| `agent_thought_chunk` | `thinking_delta` |
| `agent_message_chunk` | `delta` |
| `tool_call` (`toolCallId`,`title`,`rawInput`,`_meta["x.ai/tool"].kind`) | `tool_update` `{id, name, status:"running", detail}` |
| `tool_call_update` avec `content:[{type:"diff",oldText,newText}]` | `tool_update` (statut/output) + `edit` `{path, plus, minus}` calculé du diff |
| `plan` | `todos` |
| `user_message_chunk`, `available_commands_update`, `session_summary_generated` | ignorés |
| `_x.ai/session_notification` kind `pending_interaction`/`hook_execution` | `tool` informatif (une ligne) |
| **tout event/notification inconnu** | **ignoré silencieusement** (tolérance aux updates CLI) |

Fin de tour (réponse `session/prompt`) → `done` :
- `ok: true` si `end_turn` **ou** `cancelled` (interruption utilisateur = succès) ;
- `usage: { context: totalTokens, output: outputTokens, cost: null, turns: null }`.

Erreur JSON-RPC sur `session/prompt` → event `error`.

### Interrupt

`export async function interrupt(threadId)` → notification
`{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId"}}` (pas d'id, c'est une
notification). Le `session/prompt` en cours se résout ensuite avec `stopReason:"cancelled"`.
Le router (`router.mjs:285-290`) le prend en charge sans modification.

### Steering

Inchangé : pas d'export `steer` → le router met en file (`pending`). L'extension
`x.ai/interject` (strings binaire, non testée) = phase 2.

### Permissions

`grok agent stdio` n'a **pas** de flag `--permission-mode` (seulement `--debug`,
`--debug-file`, `--leader-socket`). Piste : ACP `session/set_mode` (strings
`SessionModeState` dans le binaire ; la réponse `session/new` contient peut-être `modes`).
Directive : **best-effort** — si la réponse `session/new` expose des modes, mapper
`permissionMode` Atelier dessus via `session/set_mode` ; sinon conserver le comportement
auto actuel (équivalent `--always-approve`). Ne pas bloquer la phase 1 là-dessus ;
documenter ce qui a été observé dans un commentaire du module.

### Fallback

Conserver l'ancien chemin (`run()` one-shot streaming-json, `normalizeGrokMessage`,
`parseGrokJsonl`) : si le handshake ACP échoue (timeout 10 s ou erreur), logger et
retomber sur l'ancien `run()` pour ce tour. Les exports de parsing existants et leurs
tests restent.

## Historique & reprise (`sessions.mjs`, `router.mjs`)

Le CLI écrit `~/.grok/sessions/<cwd-url-encodé>/<session-uuid>/` :
- `chat_history.jsonl` — transcript complet : `{"type":"user"|"assistant",…}`, tool_calls
  avec arguments, `{"type":"tool_result",…}` ;
- `signals.json` — `contextTokensUsed`, `toolCallCount`, … ;
- `summary.json`, `events.jsonl`.

Changements :
- `sessions.mjs` : branche `provider === "grok"` dans `listSessions` — lister
  `~/.grok/sessions/<encode(projectRoot)>/*/` par mtime (≤25), titre = premier message
  user de `chat_history.jsonl`. L'encodage observé : cwd avec `/` → `%2F`
  (type `encodeURIComponent`).
- Nouvelle fonction `grokHistory(sessionId, projectRoot)` → events Atelier
  (user → `{kind:"user"}` selon le format que `codexHistory` retourne — s'aligner sur
  sa forme de sortie) ; assistant text → `text` ; tool_calls → `tool`.
- `router.mjs` `getHistory` (l.718-728) : brancher `t.provider === "grok"` →
  `grokHistory` (avant le fallback codex).

## Registry & efforts

- `registry.mjs` grok : `efforts: ["minimal","low","medium","high","xhigh","max"]`
  (le CLI valide : `none, minimal, low, medium, high, xhigh, max` ; on omet `none`,
  `""` = auto tient ce rôle dans l'UI). `capabilities` inchangées
  (`resume:true, steering:false, goals:false`).
- `grok.mjs` : le set `EFFORTS` et `mapEffort` suivent. En ACP, l'effort se passe où ?
  À sonder : parmi `session/new`/`session/set_mode`/`session/prompt` (`_meta`?) ou en
  spawn arg `--reasoning-effort` du process stdio (flag présent sur `grok agent`).
  Piste la plus sûre : `grok agent stdio` hérite de `--reasoning-effort` (visible dans
  `grok agent --help`) — mais process partagé ⇒ effort par process. Si aucun mécanisme
  par-session n'est trouvé, accepter : un process par (effort) ou passer l'effort au
  spawn et respawn au changement — choisir la solution la plus simple et la documenter.
  Idem pour `--model` : `grok agent --help` expose `-m/--model` au niveau process ;
  même stratégie (respawn si model/effort du tour ≠ ceux du process courant — c'est
  acceptable, les changements de modèle mid-thread sont rares).

## Frontend

Aucun changement requis : `levelsFor` (Chat.tsx:656) utilise `info.efforts` du registry
pour les providers hors map `EFFORTS`, et les kinds émis (`tool_update`, `edit`, `todos`,
`done.usage`) sont déjà rendus (UI Codex). La map `MODELS.grok` (labels jolis) existe déjà.

## Tests

- Fixtures réelles : extraire de `run3.log`/`run4.log` (scratchpad grok-stdio-probe) des
  fichiers `sidecar/providers/fixtures/grok-acp-turn.jsonl` (tour complet avec tool_call,
  tool_call_update+diff, message chunks, réponse finale avec _meta tokens) et
  `grok-acp-cancel.jsonl`. Tronquer les champs verbeux, **purger tout credential/env MCP**.
- Unit tests (`grok.test.mjs` étendu ou `grok_acp.test.mjs`) :
  - framing newline-delimited (messages coupés en chunks arbitraires) ;
  - mapping de chaque `sessionUpdate` → kind Atelier (fixtures) ;
  - event inconnu → ignoré sans throw ;
  - réponse prompt `end_turn` et `cancelled` → `done` avec usage réel ;
  - erreur JSON-RPC → `error` ;
  - requête serveur inattendue → réponse `method not found`.
- Tests existants du parsing streaming-json conservés (fallback).
- `cd sidecar && npx vitest run` vert ; `npx tsc --noEmit` et `npx vite build` verts
  (ignorer `src/test_auto_review*.ts`).

## Vérification end-to-end (post-implémentation)

Script Node jetable (scratchpad) qui charge `grok.mjs` réécrit et joue un tour réel
minuscule (« crée result.txt contenant DONE ») dans un dossier scratch : vérifier
tool_update émis, done.usage > 0, puis un second tour interrompu par `interrupt()` →
done propre. Puis relance app selon `docs/PROTOCOLE_RELANCE.md` (par Thierry).
