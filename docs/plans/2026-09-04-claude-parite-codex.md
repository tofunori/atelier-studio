# Claude au niveau de Codex — rendu et streaming (phases A → B → C)

Contexte (2026-09-04) : audit de `claude.rs`/`claude_parse.rs` contre le CLI
2.1.261 + inventaire des écarts Codex ↔ Claude. Sonde réelle :
`claude -p --verbose --output-format stream-json --include-partial-messages`.

## Ce que le CLI ferme (hors plan)

- Thinking verbatim : chiffré (`thinking_delta` vide, `thinking:""`). Seul un
  signal de progression existe.
- Sortie d'outil progressive : pas d'`outputDelta`, le `tool_result` arrive
  entier. Rien à streamer.

## Phase A — signaux natifs inexploités (`claude_parse.rs`)

| Signal CLI | Événement harness (contrat `src/lib/ws.ts`) |
|---|---|
| `system.task_summary {detail}` | `{"kind":"tool","name":"__thinking-step","detail"}` — comme Codex (`codex_parse.rs` summaryTextDelta). Ignoré si `detail` null/vide ; pas deux fois de suite le même. |
| `system.thinking_tokens {estimated_tokens}` | alimente le ticker (`heartbeat.tokens`) : ticker = complétés + max(output_tokens du message_delta, chars/4, thinking natif). `thinking_progress` conservé (App.tsx l'intercepte, non affiché). |
| `system.permission_denied {tool_name, tool_use_id, message}` | marque le tool en attente ; `heartbeat.note = "Permission refusée — <tool>"` ; au `tool_result` du même id, `output` = message du refus si la sortie est vide. Sans tool en attente : note seule. |
| `assistant.message.usage` (déjà lu → `last_ctx`) | émettre `{"kind":"usage","usage":{context,output,cost:null,turns:null},"__ephemeral":true}` à chaque message assistant (barre de contexte en direct). |
| `result.duration_api_ms` / `duration_ms`, `permission_denials[]` | `done.usage.durationMs`, `done.usage.permissionDenials` (nombre) — champs optionnels ajoutés au type `done.usage` de ws.ts. |

Correctif Codex au passage (`codex_parse.rs` `thread/tokenUsage/updated`) :
l'événement `usage` est à plat (`context/output/window` à la racine) alors que
`ws.ts:139` + `App.tsx` attendent `usage:{…}` → jamais appliqué. Forme
corrigée : `{"kind":"usage","usage":{context,output,cost:null,turns:null,window},"__ephemeral":true}` ;
`window?: number|null` ajouté au type (ComposerControls lit déjà `p.usage.window`).

## Phase B — filet d'inactivité (`claude.rs`)

- `turn_idle::with_idle_timeout` autour de la boucle stdout ; `bump()` à
  chaque ligne stdout ET stderr (le CLI parle = vivant).
- Silence total > idle → kill du process group, flush, `error` « Claude muet
  depuis N min — tour interrompu », `ok:false`.
- Durée : `turn_idle::idle_from_env()` (déplacé depuis `codex.rs`, même
  variable `ATELIER_TURN_TIMEOUT_SECS`, même défaut 600) ; **injectée sur la
  struct** `ClaudeProvider` à la construction — jamais lue dans `send()`, jamais
  mutée dans un test (course `env::set_var`, cf. mémoire).
- Test : faux CLI (modèle existant `claude-fake-*`) qui émet `system/init`
  puis dort ; provider construit avec idle = 1 s ; attendu : `error` muet,
  process reapé, `ok:false`, durée < 10 s.

## Phase C — sous-agents (`claude_parse.rs`)

Cycle de vie natif : `system.task_started {task_id, tool_use_id, description,
subagent_type, prompt}` → `system.task_updated {task_id, patch.status}` →
`system.task_notification {task_id, status, summary, usage.{total_tokens,
tool_uses, duration_ms}}`. Les messages du sous-agent portent
`parent_tool_use_id` non nul.

Mapping sur `tool_update.agentActivity` (rendu `AgentActivity.tsx`, piloté par
la donnée, déjà en place pour Codex) :

- `task_started` → `{"kind":"tool_update","id":"subagent:<task_id>","name":"agent:activity","output":"","status":"inProgress","source":"claude","detail":<description>,"agentActivity":{"tool":"activity","receiverThreadIds":[task_id],"agentsStates":{task_id:{"status":"running","message":<description>}},"agentThreadId":task_id,"agentPath":<subagent_type>,"activityKind":"started","prompt":<prompt>}}`
  — `agentPath` = `subagent_type` pour que `displayNameFromPath` affiche « Explore ».
- `task_updated` avec `patch.status` → même id, `agentsStates[task_id].status` =
  `completed|failed|…`, `status` tool = `completed` si terminal.
- `task_notification` → `agentsStates[task_id].message` = `summary` (tronqué
  200 car.), `detail` = « 13,6k tokens · 2 outils · 1,1 s » ; status tool
  `completed`/`failed` selon `status`.
- Messages enfants (`parent_tool_use_id` ≠ null) : **aucun** `delta`/`text`/
  `thinking*` (ils polluaient la bulle principale) ; leurs `tool_use` deviennent
  une mise à jour éphémère `agentsStates[task].message = <verbe outil>`
  (ex. « Read src/x.rs »), pas une ligne d'outil du fil. Correspondance
  `tool_use_id` (parent) → `task_id` gardée dans l'état.
- `background_tasks_changed` ignoré.

## Vérification

- `cargo test -p atelier-providers` (+ nouveaux tests par branche).
- `npx tsc --noEmit`, `npx vite build`, vitest si ws.ts change.
- Sonde réelle : `claude -p … -- "Lance un sous-agent Explore…"` → vérifier
  visuellement dans l'app après relance (docs/PROTOCOLE_RELANCE.md).

## Hors plan (plans séparés)

- D : saccades du texte — mesurer au banc livestream avant de toucher.
- E : vraies permissions + vrai steer (session `--input-format stream-json`,
  stdin vivant, relais `canUseTool` via `on_interaction`).
