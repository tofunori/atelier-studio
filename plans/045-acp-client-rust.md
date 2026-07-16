# Plan 045 : Client ACP Rust partagé + OpenCode sur ACP (deux backends)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat eda4092..HEAD -- rust/crates/atelier-providers/src/opencode.rs rust/crates/atelier-providers/src/codex_rpc.rs rust/crates/atelier-providers/src/lib.rs sidecar/providers/opencode.mjs sidecar/providers/grok.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (nouveau chemin protocole dans les deux backends ; repli legacy conservé à chaque étage → dégradation contrôlée, jamais de régression dure)
- **Depends on**: none
- **Category**: feature / infra
- **Planned at**: commit `eda4092`, 2026-07-16

## Why this matters

OpenCode est déjà un provider d'Atelier, mais en mode « one-shot » : un spawn
`opencode --pure run --format json` par tour, sans interruption possible
(l'export `interrupt` n'existe pas dans `opencode.mjs` — le router saute le
cas, `router.mjs:915`), avec un historique local bricolé (JSONL maison) et un
usage approximatif. OpenCode 1.18.3 expose un serveur ACP natif (`opencode
acp`) — le même protocole que `grok agent stdio`, déjà intégré côté sidecar.

Ce plan construit **l'infra client ACP côté Rust** (le backend par défaut, où
aucun client ACP n'existe — `grok.rs:2` : « ACP full duplex is deferred ») en
calquant le précédent maison `codex_rpc.rs`, migre **opencode** dessus dans
les DEUX backends (règle du double-port mjs + rs), et laisse **grok
full-duplex Rust en phase 2** sur la même infra. Gains immédiats : process
partagé persistant (latence), `session/load` natif, interruption réelle
(`session/cancel`), thinking streamé, tool cards standard, usage riche
(fenêtre de contexte dynamique + coût).

## Contrat wire vérifié en direct (sonde du 2026-07-16, opencode 1.18.3)

Sonde réelle `initialize → session/new → session/set_mode → session/set_model
→ session/prompt` contre le binaire installé (`~/.opencode/bin/opencode acp`,
JSON-RPC 2.0 en NDJSON sur stdio, une ligne = un message, pas de
Content-Length). **Ces formes font foi** :

- `initialize {protocolVersion:1, clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}}`
  → `{protocolVersion:1, agentCapabilities:{loadSession:true, sessionCapabilities:{close:{},fork:{},list:{},resume:{}}, promptCapabilities:{embeddedContext:true,image:true}}, authMethods:[…], agentInfo:{name:"OpenCode",version:"1.18.3"}}`
- `session/new {cwd, mcpServers:[]}` → `{sessionId:"ses_…", configOptions:[
    {id:"model", category:"model", type:"select", currentValue:"opencode/big-pickle", options:[{value:"openrouter/z-ai/glm-5.2", name:"…"}, …]},
    {id:"mode",  category:"mode",  currentValue:"build", options:[{value:"build",…},{value:"plan",…}]}]}`
  ⚠️ Premier appel après spawn : peut prendre **> 15 s** (chargement
  providers/models.dev). Timeout handshake : garder 10 s pour `initialize`
  mais **30 s pour `session/new`/`session/load`**.
- `session/set_mode {sessionId, modeId:"build"}` → `{}`.
- `session/set_model {sessionId, modelId:"opencode/big-pickle"}` → `{}`.
  Le `modelId` est la **chaîne jointe telle quelle** (`provider/model`, ex.
  `openrouter/z-ai/glm-5.2`) — PAS de split providerID/modelID (la forme
  `{model:{providerID,modelID}}` répond `Invalid params`).
- Notifications `session/update {sessionId, update:{sessionUpdate: …}}` observées :
  - `agent_thought_chunk {messageId, content:{type:"text",text}}`
  - `agent_message_chunk {messageId, content:{type:"text",text}}`
  - `available_commands_update {availableCommands:[…]}` (énorme — liste les skills ; à ignorer, ne JAMAIS journaliser)
  - `usage_update {used:80401, size:200000, cost:{amount:0,currency:"USD"}}` → `size` = fenêtre de contexte du modèle courant
  - non observés ici mais émis par le code opencode (`packages/opencode/src/acp/event.ts`) : `tool_call`, `tool_call_update`, `user_message_chunk` (formes ACP standard : `toolCallId`, `title`, `kind`, `status`, `content`, `rawInput`)
- `session/prompt {sessionId, prompt:[{type:"text",text}]}` → `{stopReason:"end_turn", usage:{inputTokens, outputTokens, totalTokens, thoughtTokens, cachedReadTokens}, _meta:{}}`
- Permissions : opencode appelle `session/request_permission` côté client
  (options `[{optionId:"once",kind:"allow_once"},{optionId:"always",kind:"allow_always"},{optionId:"reject",kind:"reject_once"}]`)
  et le client DOIT répondre `{outcome:{outcome:"selected", optionId}}` —
  sinon auto-reject (source `packages/opencode/src/acp/permission.ts`).
- `session/cancel {sessionId}` = notification (sans id) ; le `session/prompt`
  en cours se résout avec `stopReason:"cancelled"` (même sémantique que grok).
- stderr : bruyant (logs, warnings plugins) — à drainer et ignorer, jamais
  bloquer le pipe. Un lock `opencode-goal-plugin` d'une autre instance est
  non-fatal.

## Current state

### Rust (`rust/crates/atelier-providers/`)

- `src/opencode.rs:1-238` — provider one-shot : spawn per-tour
  `--pure run --format json --dir <cwd> --auto [--model m] [--variant e]
  [--session sid] <prompt>`, parse via `opencode_parse.rs`, kill par
  `runs: Mutex<HashMap<String, Child>>` au tour suivant. Pas d'ACP.
- `src/codex_rpc.rs:1-140+` — **LE modèle à calquer** : `CodexAppServer` =
  un process JSON-RPC stdio partagé (`codex app-server`), `Inner {child,
  stdin, pending: HashMap<u64, Pending>, handlers, request_handlers,
  next_id}`, reader task + dispatcher task (`tokio::spawn`), tout `Send`
  (tokio primitives), reset-on-exit qui draine `pending` et notifie les
  handlers. `ServerRequestHandler = Arc<dyn Fn(String, Value) -> Pin<Box<dyn
  Future<Output=Value> + Send>> + Send + Sync>` (`codex_rpc.rs:17-19`).
- `src/traits.rs:22-41` — `SendRequest {thread_id, turn_id, prompt, inputs,
  project_root, session_id, model, effort, permission_mode, mode, on_event:
  Arc<dyn Fn(Value)+Send+Sync>, on_interaction, is_cancelled}`;
  `SendResult {session_id, ok, error}` (`:50-54`). Le trait est `Send + Sync`,
  futures `Send` (async_trait) — **le client ACP doit être Send**.
- `src/lib.rs` — point d'enregistrement des `mod`.
- Catalogues : AUCUN changement requis (`registry.rs`, `atelier-protocol`
  `builtin_providers()` restent tels quels ; capabilities opencode inchangées,
  `permissions:false`).

### Sidecar (`sidecar/providers/`)

- `grok.mjs` — le template ACP mjs complet : `parseAcpLines` `:311` (framing
  NDJSON pur), `acpMethodNotFoundResponse` `:332`, `handleIncoming` `:615`
  (dispatch requête/réponse/notification), `spawnServer` `:643` +
  `ensureServer` `:688` (singleton process + re-spawn si binaire remplacé),
  `openGrokSession` `:719` (load → repli new si cwd différent),
  `alignSessionMode` `:753` (best-effort), `makeTurnEmitter` `:777`
  (adjacence deltas→bloc final), `runAcp` `:800`, `run` `:850` (ACP d'abord,
  repli `runLegacy` sur échec handshake marqué `acpHandshakeFailure`),
  `interrupt` `:711` (`session/cancel` via `activeTurns`).
- `grok.mjs:392-441` — formes wire des events Atelier à REPRODUIRE :
  `tool_update {kind:"tool_update", id, name, status, detail?, output: STRING
  REQUIS (jamais undefined — crash UI constaté 2026-07-08), input, source}` ;
  `edit {kind:"edit", files:[paths]}` dédupliqué par
  `(toolCallId, path, len(newText))` via `seenEdits`.
- `opencode.mjs` — legacy one-shot : exports `makeTranscriptRecorder` `:24`,
  `history` `:54`, `normalizeOpenCodeMessage` `:162`, `parseOpenCodeJsonl`
  `:222`, `run({cwd,prompt,sessionId,model,effort,permissionMode,timeoutMs,
  onEvent})` `:239`. PAS d'export `interrupt`. `buildPrompt` `:130` (préambule
  projet), recorder JSONL local persisté au settle `:271-291`.
- `sidecar/router.mjs:912-915` — `case "interrupt"` : appelle
  `prov.interrupt(threadId)` **si exporté**.
- Contrat events (mémoire projet, pièges vérifiés en réel) :
  `tool_update.output` string requis ; events fréquents → ne pas journaliser
  (`__ephemeral`) sinon le journal gonfle → **`usage_update` ne doit JAMAIS
  être ré-émis comme event, seulement absorbé dans le `done` final** ; tout
  nouveau champ transportant du contenu de fichier doit passer la redaction du
  journal → **pas de `snippets` sur les events `edit` en v1** (files
  seulement).

## Décisions arrêtées (ne pas re-débattre en exécutant)

1. **Client ACP maison calqué sur `codex_rpc.rs`** — PAS la crate officielle
   `agent-client-protocol` 1.2.0 : API réécrite il y a 3 semaines
   (builder-callbacks qui possède la connexion dans une closure — mauvais fit
   avec `Provider::send` sur connexion partagée longue durée), MSRV
   1.88/edition 2024 non validés pour le workspace, et le sous-ensemble requis
   tient en ~350 lignes déjà prouvées en repo (codex_rpc) + en mjs (grok).
2. **Permissions** : réponse automatique `allow_once` à toute
   `session/request_permission` (parité avec le `--auto` du legacy). Catalogue
   inchangé (`permissions:false`). Permissions interactives via
   `on_interaction` = suivi ultérieur, pas v1.
3. **Effort** : pas d'équivalent ACP (`--variant` est CLI-only) → ignoré sur
   le chemin ACP, sans warning UI. Le repli legacy le garde.
4. **Modèle** : `session/set_model {sessionId, modelId:"<chaîne catalogue telle
   quelle>"}`, best-effort comme `alignSessionMode` de grok (un refus ne casse
   jamais le tour ; on mémorise la dernière sélection par session).
5. **`usage_update`** : absorbé dans le contexte du tour ; le `done` final
   fusionne `usage` de la réponse prompt (tokens) + dernier `usage_update`
   (window=`size`, cost=`cost.amount`).
6. **`edit`** : `files` seulement (pas de snippets v1 — piège redaction).
7. **Repli legacy** : uniquement sur échec de handshake
   (spawn/initialize/session-open), marqué explicitement — jamais sur une
   erreur en cours de tour (celle-là devient `{kind:"error"}`, comme grok).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests providers Rust | `cargo test -p atelier-providers --manifest-path rust/Cargo.toml --locked` | verts, nouveaux tests inclus |
| Tests workspace Rust | `npm run test:rust-workspace` | verts |
| Tests sidecar | `cd sidecar && npx vitest run` | verts, `opencode_acp.test.mjs` inclus |
| Typecheck front | `npx tsc --noEmit` | exit 0 (aucun changement front) |
| Build front | `npx vite build` | exit 0 |

## Scope

**In scope** (the only files you should modify or create):
- Create : `rust/crates/atelier-providers/src/acp_rpc.rs`
- Create : `rust/crates/atelier-providers/src/acp_map.rs`
- Modify : `rust/crates/atelier-providers/src/opencode.rs`
- Modify : `rust/crates/atelier-providers/src/lib.rs` (2 lignes `mod`)
- Create : `sidecar/providers/acp_common.mjs`
- Modify : `sidecar/providers/grok.mjs` (UNIQUEMENT remplacer les définitions
  de `parseAcpLines`/`acpMethodNotFoundResponse`/`makeTurnEmitter` par un
  ré-export depuis `acp_common.mjs` — zéro changement de comportement)
- Modify : `sidecar/providers/opencode.mjs` (ajout chemin ACP + `interrupt`)
- Create : `sidecar/opencode_acp.test.mjs`

**Out of scope** (do NOT touch, even though they look related):
- `grok.rs` / le comportement runtime de `grok.mjs` — **phase 2** (voir
  Maintenance notes).
- Les catalogues (`registry.rs`, `builtin_providers()` d'atelier-protocol,
  `registry.mjs`) — aucun changement de capabilities/modèles.
- Le frontend (`src/`) — la liste des providers est dynamique, rien à toucher.
- `router.mjs`, `sessions.mjs`, `codex_rpc.rs` (référence en lecture seule).
- `opencode_parse.rs` et le chemin legacy d'`opencode.mjs`/`opencode.rs`
  (conservés tels quels comme repli).

## Git workflow

- Branche : `advisor/045-acp-client-rust`
- Un commit par volet (rust infra / rust opencode / sidecar / plan), messages
  style repo.
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : `acp_rpc.rs` — serveur ACP partagé générique (Rust)

Créer `rust/crates/atelier-providers/src/acp_rpc.rs` en calquant la
structure de `codex_rpc.rs` (mêmes primitives tokio, mêmes tasks
reader/dispatcher, même reset-on-exit). Interface publique exacte :

```rust
//! Client ACP partagé (JSON-RPC 2.0 en NDJSON sur stdio) — un process par
//! provider, sessions multiplexées. Calqué sur codex_rpc.rs (plan 045).

pub type SessionUpdateHandler = Arc<dyn Fn(&Value) + Send + Sync>;

pub struct AcpServer { /* label + Arc<Mutex<Option<AcpInner>>> */ }

impl AcpServer {
    pub fn new(label: &'static str) -> Self;
    /// Spawn + `initialize` si process absent/mort. `init_params` = params
    /// d'initialize. Timeout handshake 10 s. Err(msg) = échec de handshake
    /// (déclencheur du repli legacy chez l'appelant).
    pub async fn ensure(&self, bin: &Path, args: &[String], init_params: Value) -> Result<(), String>;
    /// Requête JSON-RPC sortante ; `timeout_ms: None` = attente illimitée
    /// (session/prompt), `Some(n)` pour les opérations de handshake.
    pub async fn request(&self, method: &str, params: Value, timeout_ms: Option<u64>) -> Result<Value, String>;
    /// Notification sortante (sans id) — session/cancel.
    pub async fn notify(&self, method: &str, params: Value);
    pub async fn set_session_handler(&self, session_id: &str, h: SessionUpdateHandler);
    pub async fn clear_session_handler(&self, session_id: &str);
}
```

Comportements requis (dispatch entrant, à tester unitairement en isolant les
fonctions pures) :

1. **Framing** : `BufReader::lines()` assure le découpage (comme
   `codex_rpc.rs:92-93`) ; chaque ligne est parsée avec `serde_json::from_str`,
   lignes vides ou JSON invalide ignorés silencieusement (`Err(_) => continue`,
   miroir de la tolérance de `parseAcpLines`, `grok.mjs:311`).
2. **Requête serveur→client** (`msg.id != null && msg.method`) :
   - `session/request_permission` → répondre
     `{"outcome":{"outcome":"selected","optionId": <option kind=="allow_once", sinon la première>}}` ;
     si aucune option : `{"outcome":{"outcome":"cancelled"}}`.
   - toute autre méthode → `{"jsonrpc":"2.0","id":…,"error":{"code":-32601,"message":"Method not found: <m>"}}`.
   Fonction pure `fn response_for_server_request(msg: &Value) -> Value`.
3. **Réponse** (`msg.id` sans `method`) → résoudre/rejeter le `pending`
   correspondant (`oneshot`), `msg.error.message` en Err.
4. **Notification `session/update`** → handler par `params.sessionId` ; pas de
   handler = silence (tour fini). Autres notifications : ignorées, jamais
   journalisées.
5. **Exit du process** : drainer `pending` en Err, vider les handlers,
   `Inner = None` (prochain `ensure` re-spawn). `kill_on_drop(true)` +
   `process_group(0)` comme `codex_rpc.rs:78-82`. stderr : drainé et jeté.

Ajouter dans `lib.rs` : `mod acp_map;` `mod acp_rpc;` (ordre alphabétique,
même style que les `mod` existants).

Tests `#[cfg(test)]` dans le module (pures, sans process) :

```rust
#[test] fn permission_auto_allow_once() { /* options [reject, allow_once] -> optionId "once" */ }
#[test] fn permission_sans_options_cancelled() { /* -> outcome cancelled */ }
#[test] fn permission_options_sans_allow_once_prend_la_premiere() {}
#[test] fn unknown_server_request_method_not_found() { /* -> error.code -32601, id repris */ }
```

**Verify**: `cargo test -p atelier-providers --manifest-path rust/Cargo.toml --locked` → verts.

### Step 2 : `acp_map.rs` — mapping `session/update` → kinds Atelier (Rust)

Créer `rust/crates/atelier-providers/src/acp_map.rs`. Fonctions pures,
miroir de `grok.mjs:342-511` adapté aux champs ACP **standard** (pas de
`_meta["x.ai/tool"]`) :

```rust
/// État mémoire d'un tour (toolCallId répétés + dédup des edits).
#[derive(Default)]
pub struct TurnCtx {
    pub tool_meta: HashMap<String, ToolMeta>, // name/detail/input mémorisés
    pub seen_edits: HashSet<String>,          // "toolCallId:path:len"
    pub last_usage_update: Option<Value>,     // dernier usage_update brut
}

/// `params.update` -> 0..n events Atelier (Value). Inconnu => vec![].
pub fn map_session_update(update: &Value, ctx: &mut TurnCtx) -> Vec<Value>;

/// Réponse de session/prompt -> event `done`.
pub fn map_prompt_result(result: &Value, ctx: &TurnCtx) -> Value;

/// Émetteur bufferisé : adjacence deltas -> bloc final (miroir makeTurnEmitter
/// grok.mjs:777). `emit()` route via le on_event fourni ; `flush()` en fin.
pub struct TurnEmitter { /* message_buffer, thought_buffer, on_event */ }
impl TurnEmitter {
    pub fn new(on_event: Arc<dyn Fn(Value) + Send + Sync>) -> Self;
    pub fn emit(&mut self, ev: Value);
    pub fn flush(&mut self);
}
```

Table de mapping (chaque forme wire d'entrée vient de la section « Contrat
wire vérifié ») :

| `sessionUpdate` | Event(s) Atelier |
|---|---|
| `agent_thought_chunk` | `{"kind":"thinking_delta","text":content.text}` |
| `agent_message_chunk` | `{"kind":"delta","text":content.text}` |
| `tool_call` | `{"kind":"tool_update","id":toolCallId,"name":title∥kind∥"tool","status":"running","detail":kind si ≠ name,"output":"","input":rawInput∥null,"source":"opencode"}` + mémoriser dans `ctx.tool_meta` |
| `tool_call_update` | même forme avec `status` mappé (contient fail/error/reject→`"failed"` ; complet/done/success→`"completed"` ; progress/pending→`"running"` ; sinon : contenu présent→`"completed"`, sinon `"running"`), `output` = concat des `content[]` (type `text` → texte ; type `diff` → `"# <path>\n<newText>"`), champs manquants repris de `ctx.tool_meta` ; PLUS events `{"kind":"edit","files":[paths]}` pour chaque `content[]` de type `diff` avec `path`, dédupliqués par `ctx.seen_edits` (clé `toolCallId:path:len(newText)`) |
| `usage_update` | `vec![]` — mais stocker le brut dans `ctx.last_usage_update` |
| `user_message_chunk`, `available_commands_update`, `current_mode_update`, `session_summary_generated` | `vec![]` |
| inconnu | `vec![]` (jamais d'erreur) |

`map_prompt_result` : `ok = stopReason ∈ {"end_turn","cancelled"}` ; usage
fusionné :

```rust
json!({"kind":"done","ok":ok,"result":"","usage":{
    "context": result.usage.totalTokens ?? last_usage_update.used ?? 0,
    "output":  result.usage.outputTokens ?? 0,
    "cost":    last_usage_update.cost.amount ?? null,
    "turns":   null,
    "window":  last_usage_update.size ?? null,
}})
```

(accès tolérants : tout champ absent/non-numérique → défaut ci-dessus).

**Invariant à tester en priorité : `tool_update.output` est TOUJOURS une
string** (`""` au pire) — le front crashe sinon.

Tests `#[cfg(test)]` minimum :

```rust
#[test] fn thought_chunk_to_thinking_delta() { /* forme wire sonde -> kind + text exacts */ }
#[test] fn message_chunk_to_delta() {}
#[test] fn tool_call_output_toujours_string() { /* sans content -> output == "" */ }
#[test] fn tool_call_update_statuses() { /* failed/completed/running/heuristique contenu */ }
#[test] fn tool_call_update_reprend_meta_cachee() { /* 2e update sans title -> name du cache */ }
#[test] fn diff_content_donne_edit_dedup() { /* même diff 2x -> 1 seul event edit */ }
#[test] fn usage_update_absorbe_pas_emis() { /* map -> vec![], ctx.last_usage_update rempli */ }
#[test] fn prompt_result_done_usage_fusionne() { /* usage sonde + usage_update -> context/output/window/cost */ }
#[test] fn prompt_result_cancelled_ok() { /* stopReason cancelled -> ok:true */ }
#[test] fn emitter_adjacence_flush() { /* thinking_delta,delta,tool -> flush thinking+text AVANT tool */ }
```

**Verify**: `cargo test -p atelier-providers --manifest-path rust/Cargo.toml --locked` → verts.

### Step 3 : `opencode.rs` — ACP d'abord, legacy en repli (Rust)

1. Renommer le corps actuel de `send` en `async fn send_legacy(&self, req:
   SendRequest) -> SendResult` (AUCUN changement de logique interne).
2. Ajouter à `OpenCodeProvider` : `acp: AcpServer` (créé dans `new()` avec le
   label `"opencode"`), `acp_sessions: Mutex<HashMap<String, String>>`
   (session ACP déjà ouvertes dans CE process → évite les re-load),
   `acp_selection: Mutex<HashMap<String, String>>` (dernier modelId aligné
   par session), `active_turns: Mutex<HashMap<String, String>>`
   (thread_id → sessionId, pour interrupt).
3. Nouveau `send` :

```rust
async fn send(&self, req: SendRequest) -> SendResult {
    match self.send_acp(&req).await {
        Ok(r) => r,
        Err(handshake_msg) => {
            eprintln!("[opencode] handshake ACP échoué, repli run one-shot: {handshake_msg}");
            self.send_legacy(req).await
        }
    }
}
```

4. `send_acp(&self, req: &SendRequest) -> Result<SendResult, String>` —
   séquence (miroir de `runAcp`, `grok.mjs:800-848`) :
   - `ensure(bin, ["acp","--cwd",cwd], init_params)` avec les
     `clientCapabilities` de la section contrat. Échec → `Err` (repli).
   - Ouverture session : si `req.session_id` présent ET pas dans
     `acp_sessions` → `session/load {sessionId, cwd, mcpServers:[]}` (timeout
     30 s) ; refus avec process vivant → repli `session/new` (nouveau sid,
     comme grok `openGrokSession:719-748`) ; process mort → `Err` (repli
     legacy). Sans session_id → `session/new {cwd, mcpServers:[]}` (30 s).
     Mémoriser `currentValue` de l'option `category=="model"` de
     `configOptions` dans `acp_selection`.
   - Alignement modèle best-effort : si `req.model` non vide et ≠ sélection
     connue → `session/set_model {sessionId, modelId}` (10 s) ; refus →
     `tracing::warn!`, continuer. (`req.effort` : ignoré, décision 3.)
   - Enregistrer le handler : `TurnCtx` + `TurnEmitter` sur `req.on_event` ;
     `set_session_handler(sid, |update| pour ev dans map_session_update →
     emitter.emit(ev))` (le handler partage `Mutex<(TurnCtx, TurnEmitter)>`).
   - `active_turns.insert(thread_id, sid)`.
   - Tâche d'annulation : toutes les 500 ms, si `(req.is_cancelled)()` →
     `notify("session/cancel", {sessionId})` une seule fois (le prompt se
     résout ensuite en `cancelled`).
   - `request("session/prompt", {sessionId, prompt:[{type:"text",text:
     req.prompt}]}, None)` ; Ok → `emitter.flush()` puis
     `on_event(map_prompt_result(...))` ; Err en cours de tour →
     `emitter.flush()` + `on_event({"kind":"error","message":…})` et
     `SendResult{ok:false,…}` (PAS de repli legacy, décision 7).
   - `finally` : `clear_session_handler`, `active_turns.remove`.
   - Retour `SendResult {session_id: Some(sid), ok, error}`.
5. `interrupt` :

```rust
async fn interrupt(&self, thread_id: &str) -> bool {
    if let Some(sid) = self.active_turns.lock().await.get(thread_id).cloned() {
        self.acp.notify("session/cancel", json!({"sessionId": sid})).await;
        return true;
    }
    // legacy : kill du run one-shot (comportement existant, opencode.rs:265-268)
    if let Some(mut c) = self.runs.lock().await.remove(thread_id) {
        let _ = c.kill().await;
    }
    true
}
```

**Verify**:
- `cargo test -p atelier-providers --manifest-path rust/Cargo.toml --locked` → verts.
- `npm run test:rust-workspace` → verts (rien d'autre ne casse).

### Step 4 : `acp_common.mjs` — extraction des helpers purs (sidecar)

1. Créer `sidecar/providers/acp_common.mjs` et y DÉPLACER, à l'identique
   (corps inchangés, commentaires compris), depuis `grok.mjs` :
   `parseAcpLines` (`:311`), `acpMethodNotFoundResponse` (`:332`),
   `makeTurnEmitter` (`:777`).
2. Dans `grok.mjs`, remplacer les trois définitions par :

```js
export { parseAcpLines, acpMethodNotFoundResponse, makeTurnEmitter } from "./acp_common.mjs";
```

   (ré-export : les imports existants de grok.mjs continuent de marcher ;
   aucun autre changement dans ce fichier).

**Verify**: `cd sidecar && npx vitest run` → verts (suite existante intacte).

### Step 5 : `opencode.mjs` — chemin ACP + interrupt (sidecar)

Ajouter au fichier (sans toucher au chemin legacy ni aux exports existants) :

1. **Singleton process** : état module `let acpServer = null;` +
   `const acpPendingRpc = new Map(); const acpSessionHandlers = new Map();
   const acpLoadedSessions = new Set(); const acpSessionModel = new Map();
   const acpActiveTurns = new Map();` — miroir de `grok.mjs:576-581`.
2. `spawnAcpServer()` / `ensureAcpServer()` / `stopAcpServer()` /
   `handleAcpIncoming(proc, msg)` : calqués sur `grok.mjs:602-706` avec les
   différences opencode :
   - spawn `OPENCODE_BIN` avec `["acp", "--cwd", workDir]`… **non** :
     `opencode acp` prend le cwd au spawn ; or le process est partagé entre
     threads de cwd différents. Vérifié : `session/new`/`session/load`
     portent leur PROPRE `cwd` par session → spawner SANS `--cwd` (défaut
     `process.cwd()` du sidecar, sans importance) et passer le cwd par
     session. C'est le même schéma que grok (`spawnServer:645` ne passe pas
     de cwd).
   - `initialize` : mêmes `clientCapabilities` que le contrat (fs false ×2,
     terminal false), timeout 10 s ; `session/new`/`session/load` : timeout
     30 s (premier appel lent — contrat).
   - `handleAcpIncoming` : requête serveur→client `session/request_permission`
     → répondre `allow_once` (forme du contrat) ; autres méthodes → réponse
     `acpMethodNotFoundResponse` ; notifications `session/update` → handler
     par sessionId ; le reste ignoré sans journalisation.
3. `mapOpencodeSessionUpdate(update, ctx)` **exporté** (testable) — la table
   du Step 2 en JS, avec `source:"opencode"` et le même invariant
   `output: string` ; `mapOpencodePromptResult(result, ctx)` **exporté** —
   `done` fusionné (usage prompt + dernier `usage_update` du ctx).
4. `openOpencodeSession(srv, {sessionId, cwd})` : load → repli new (miroir
   `openGrokSession:719-748`), mémorise `currentValue` du `configOptions`
   `category=="model"` dans `acpSessionModel`.
5. `alignOpencodeModel(srv, sid, model)` : si `model` non vide ≠ connu →
   `session/set_model {sessionId, modelId: model}` best-effort (warn sur
   refus).
6. `runAcp({threadId, cwd, prompt, sessionId, model, timeoutMs, onEvent})` :
   miroir `grok.mjs:800-848` — recorder transcript INCLUS :
   `const recorder = makeTranscriptRecorder(prompt);` absorbé dans l'émetteur
   (`recorder.absorb(ev)` sur chaque event émis), `recorder.persist(sid)`
   dans le `finally` (le chemin ACP garde ainsi l'historique local existant).
   Prompt : `buildPrompt(prompt)` (préambule projet conservé, `:130`).
7. `run(opts)` : renommer l'actuel en `runLegacy(opts)` (corps inchangé) et :

```js
export async function run(opts) {
  try {
    return await runAcp(opts);
  } catch (e) {
    if (!e?.acpHandshakeFailure) throw e;
    console.warn("[opencode] handshake ACP échoué, repli run one-shot:", e.message);
    return runLegacy(opts);
  }
}
```

8. `export async function interrupt(threadId)` : `session/cancel` via
   `acpActiveTurns` (miroir `grok.mjs:711-715`). Le router le découvre tout
   seul (`router.mjs:915`).

**Verify**: `cd sidecar && npx vitest run` → verts.

### Step 6 : `sidecar/opencode_acp.test.mjs` — tests du mapping (sidecar)

Nouveau fichier vitest (modèle : suites existantes de `sidecar/*.test.mjs`),
qui importe `mapOpencodeSessionUpdate`, `mapOpencodePromptResult` depuis
`./providers/opencode.mjs` et `parseAcpLines`, `makeTurnEmitter` depuis
`./providers/acp_common.mjs`. Cas requis (formes wire = section contrat,
copier les JSON de la sonde) :

1. `agent_thought_chunk` → `[{kind:"thinking_delta", text:"The user wants me"}]`.
2. `agent_message_chunk` → `[{kind:"delta", text:"ok"}]`.
3. `tool_call` sans content → `output === ""` (typeof string), `status:"running"`, `source:"opencode"`.
4. `tool_call_update` avec `content:[{type:"diff",path:"/a.txt",newText:"x"}]`
   → un `tool_update` `status:"completed"` + un `edit {files:["/a.txt"]}` ;
   rejouer le même update avec le même ctx → PAS de second `edit`.
5. `usage_update` (JSON exact de la sonde) → `[]` et
   `ctx.lastUsageUpdate.size === 200000`.
6. `available_commands_update` → `[]`.
7. `mapOpencodePromptResult({stopReason:"end_turn", usage:{totalTokens:80437,
   outputTokens:4}}, ctx avec usage_update de la sonde)` →
   `done.ok === true`, `usage.context === 80437`, `usage.output === 4`,
   `usage.window === 200000`, `usage.cost === 0`.
8. `stopReason:"cancelled"` → `ok:true` ; `stopReason:"refusal"` → `ok:false`.
9. Émetteur : séquence `thinking_delta`, `delta`, `tool_update`, flush →
   le buffer thinking est flushé dès l'arrivée du `delta`, et le buffer texte
   avant le `tool_update` (adjacence — asserter l'ordre exact des kinds reçus :
   `thinking_delta, thinking, delta, text, tool_update`).

**Verify**: `cd sidecar && npx vitest run opencode_acp.test.mjs` → verts (9+ tests).

### Step 7 : vérifications transverses

1. `npm run test:rust-workspace` → verts.
2. `cd sidecar && npx vitest run` → verts.
3. `npx tsc --noEmit` → exit 0 ; `npx vite build` → exit 0 (aucun changement
   front attendu — si l'un échoue, c'est un drift préexistant : STOP).
4. E2E réel optionnel (recommandé si le poste a l'auth opencode) : un tour
   minimal via le chemin ACP Rust — test ignoré par défaut
   `#[ignore = "réseau + auth opencode requis"]` dans `opencode.rs`, lancé à
   la main : `cargo test -p atelier-providers --manifest-path rust/Cargo.toml
   --locked -- --ignored opencode_acp_e2e`. Il fait un `send` avec prompt
   « Réponds exactement: ok » et asserte : `ok:true`, au moins un event
   `delta`, un `done` avec `usage.window > 0`, et `session_id` commençant par
   `ses_`.

**Verify**: les quatre commandes ci-dessus vertes.

## Test plan

- Rust : framing/permission/refus (`acp_rpc.rs`, Step 1), table de mapping +
  émetteur + done (`acp_map.rs`, Step 2), E2E ignoré (Step 7.4).
- Sidecar : `opencode_acp.test.mjs` (Step 6) ; la suite existante protège le
  legacy et le ré-export grok (Steps 4-5).
- Le chemin legacy des deux backends n'est couvert par AUCUN nouveau test :
  il est inchangé — sa non-régression est vérifiée par les suites existantes.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cargo test -p atelier-providers --manifest-path rust/Cargo.toml --locked` exit 0
- [ ] `npm run test:rust-workspace` exit 0
- [ ] `cd sidecar && npx vitest run` exit 0 (dont `opencode_acp.test.mjs`)
- [ ] `npx tsc --noEmit` exit 0 et `npx vite build` exit 0
- [ ] `grep -c "session/prompt" rust/crates/atelier-providers/src/opencode.rs` ≥ 1
- [ ] `grep -c "mod acp_rpc" rust/crates/atelier-providers/src/lib.rs` = 1
- [ ] `grep -c "acpHandshakeFailure" sidecar/providers/opencode.mjs` ≥ 1 (repli câblé)
- [ ] `grep -c "export async function interrupt" sidecar/providers/opencode.mjs` = 1
- [ ] `grep -c "from \"./acp_common.mjs\"" sidecar/providers/grok.mjs` = 1
- [ ] `grep -c "output" sidecar/opencode_acp.test.mjs` ≥ 1 et le test 3 asserte `typeof === "string"`
- [ ] `git status` : seuls les fichiers in-scope (+ `plans/README.md`) modifiés/créés

## STOP conditions

Stop and report back (do not improvise) if:

- Les extraits « Current state » ne correspondent plus au code (drift).
- `opencode acp` répond une forme différente du « Contrat wire vérifié »
  (ex. `session/set_model` refuse `modelId` string, ou `initialize` échoue
  avec le binaire installé) — re-sonder et reporter, ne pas deviner.
- Un test existant (vitest sidecar ou cargo) casse après le Step 4
  (l'extraction `acp_common.mjs` devait être neutre) — reporter le conflit.
- L'E2E optionnel montre des `tool_update` sans `output` string ou une bulle
  streaming orpheline (adjacence) — corriger le mapper AVANT de livrer, ce
  sont les deux crashs UI documentés.
- Il faut toucher un fichier hors scope pour faire passer un test.

## Maintenance notes

- **Phase 2 (plan séparé)** : grok full-duplex Rust sur `acp_rpc.rs` —
  remplacer le streaming-json de `grok.rs` par le même schéma que
  `opencode.rs` (les spécificités grok restent dans un mapper dédié :
  `_meta["x.ai/tool"]`, `_x.ai/session_notification`, `session/set_mode`
  double catégorie model/effort — voir `grok.mjs:342-475`). Prérequis réglé
  par ce plan : l'infra process/framing/permission est commune.
- Les `configOptions` de `session/new` listent les VRAIS modèles disponibles
  (auth incluse) — amélioration future : en dériver `listModels`/le catalogue
  au lieu des listes statiques (les listes actuelles mentionnent des modèles
  openrouter que la sonde confirme disponibles, mais le défaut réel de
  l'utilisateur est `opencode/big-pickle`).
- `usage_update.size` donne la fenêtre de contexte dynamique — si un jour le
  front veut l'anneau exact pour opencode, elle est déjà dans `done.usage.window`.
- L'interruption legacy mjs reste inexistante (comme avant ce plan) ; seule
  l'interruption ACP est réelle. Si le repli legacy devient fréquent (logs
  `repli run one-shot`), sonder `opencode acp` à la main avant d'accuser le code.
- `session/set_model` est une méthode **unstable** côté opencode — si une
  mise à jour du binaire la renomme, le tour continue sur le modèle par
  défaut de la session (best-effort) : symptôme = warn `set_model refusé`
  dans les logs sidecar/tracing.

### Revue indépendante (Codex, 2026-07-16) — triage

**Corrigé avant commit** : double-spawn du singleton sous tours concurrents
(rs : verrou tenu pendant tout le spawn + génération vérifiée par le reader
avant dispatch/cleanup ; mjs : spawn single-flight `acpSpawnPromise` + gardes
d'identité sur `exit`/`stdout`) ; zombie process sur échec d'`initialize`
(mjs : kill + purge du pending avant le repli legacy) ; `session/set_model`
mjs borné à 10 s (sinon tour ininterrompable avant `activeTurns`).

**Rejeté (faux positifs), avec justification** : statuts d'outils inconnus
réémis bruts = parité voulue avec grok (`grok.mjs:353`, le front les tolère) ;
clé de dédup edits en octets (rs) vs unités UTF-16 (mjs) = clé purement locale
à un backend, jamais comparée entre eux ; steer concurrent sur la même session
= impossible pour opencode (`steering:false` → le runtime met en file,
`send.rs:522`) ; ids JSON-RPC non-u64 ignorés = nos ids sortants sont toujours
u64, les ids entrants des requêtes serveur sont réémis tels quels.

**Accepté mais différé (parité exacte avec grok.mjs/codex_rpc.rs, à traiter
en phase 2 sur l'infra commune)** : `session/cancel` ne garantit pas la
résolution du prompt si le serveur ne répond plus (échappatoire : mort du
process → drain) ; mutex tenu pendant les écritures stdin (pattern
codex_rpc.rs:250-255) ; buffer de ligne NDJSON non borné. Ces trois points
existent à l'identique dans grok.mjs aujourd'hui.
