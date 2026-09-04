# Claude — session vivante : vrai steer + vraies permissions (phase E)

Suite de `2026-09-04-claude-parite-codex.md`. Sondes réelles du CLI 2.1.261
(scripts `/tmp/probe_stream_input.py`, `/tmp/probe_perm.py`, `/tmp/probe_steer.py`),
toutes vérifiées le 2026-09-04 :

- `claude -p --input-format stream-json --output-format stream-json --verbose
  --include-partial-messages --permission-prompt-tool stdio --permission-prompts host
  --permission-mode <mode> …` : le prompt part sur **stdin** en NDJSON
  `{"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}`
  (plus de positionnel). Un `result` par tour ; le process reste vivant tant
  que stdin est ouvert (la clôture de stdin le termine).
- **Steer** : un second message `user` écrit sur stdin **pendant** le tour est
  pris en compte dans le tour courant (sonde : « STOP » envoyé après le 1er
  tool_use → un seul outil exécuté, réponse « STEER REÇU », un seul `result`,
  `num_turns: 2`). Pas de kill, pas de `--resume`.
- **Permissions** : avec `--permission-prompt-tool stdio` (obligatoire —
  `--permission-prompts host` seul refuse en silence), le CLI émet sur stdout
  ```
  {"type":"control_request","request_id":"<uuid>","request":{"subtype":"can_use_tool",
    "tool_name":"Write","display_name":"Write","input":{…},"description":"/tmp/x.txt",
    "permission_suggestions":[{"type":"setMode","mode":"acceptEdits","destination":"session"}],
    "tool_use_id":"toolu_…"}}
  ```
  et attend sur stdin
  ```
  {"type":"control_response","response":{"subtype":"success","request_id":"<uuid>",
    "response":{"behavior":"allow","updatedInput":<input>}}}
  ```
  ou `{"behavior":"deny","message":"…"}`. Tant qu'il attend, il est muet.
- Thinking : chiffré quoi qu'il arrive (`thinkingDisplay` sans effet) — hors plan.

## Architecture (v1 : un process par TOUR, stdin vivant)

Pas de process persistant entre les tours (modèle/effort/permission-mode sont
figés au spawn ; `--resume <sid>` garde le contexte). Le gain steer +
permissions ne dépend que d'un stdin ouvert pendant le tour.

### `rust/crates/atelier-providers/src/claude.rs`

1. `build_args` : ajouter `--input-format stream-json`,
   `--permission-prompt-tool stdio`, `--permission-prompts host` ; **retirer**
   le prompt positionnel (et donc le `--`). Le prompt devient le premier
   message stdin, écrit juste après le spawn. `req.inputs` : comportement
   inchangé (aujourd'hui ignoré par claude.rs).
2. `ActiveRun { child, stdin: Arc<tokio::sync::Mutex<ChildStdin>> }` ;
   `stdin(Stdio::piped())`. Helper `write_line(&stdin, Value)`.
3. Boucle stdout (sous `with_idle_timeout`, inchangé) :
   - `type == "control_request"` → `activity.bump()` ; si `subtype == "can_use_tool"` :
     spawn d'une tâche (ne jamais bloquer la boucle) qui appelle
     `req.on_interaction` avec la méthode **`"claude/can_use_tool"`** et
     `params = request` ; réponse `Some({"allow":true,…})` → `control_response`
     allow avec `updatedInput = request.input` ; `Some({"allow":false})`, `None`
     (expiré / pas d'UI) ou `on_interaction == None` → `deny` avec message
     « Refusé dans Atelier ». Autre subtype → `{"subtype":"error","error":"unsupported"}`.
     Pendant l'attente, émettre `{"kind":"heartbeat","note":"En attente de ta permission — <tool>"}`.
   - `saw_terminal` (après `result`) → **fermer stdin** (drop) pour que le CLI
     sorte ; la boucle finit sur EOF comme aujourd'hui.
4. `send()` avec `mode == SendMode::Steer` et un `ActiveRun` vivant pour le
   fil : écrire le message `user` sur son stdin, émettre
   `{"kind":"tool","name":"__steered"}`, retourner `SendResult{ok:true,
   session_id}` **sans toucher au process**. Sans run vivant : chemin normal
   (nouveau process `--resume`), comme le repli Codex.
5. `interrupt` : inchangé (SIGTERM du groupe).

### `rust/crates/atelier-runtime/src/send.rs`

- **Supprimer** le cas spécial `if running && mode != "queue" && provider == "claude"`
  (request_cancel + interrupt + attente) : Claude prend le chemin générique
  steer (`guard.steer` → même turn_id, `pimpl.send(req)` en `SendMode::Steer`,
  `on_interaction: Some(interaction)` déjà posé aux deux chemins).
- `describe_server_request` : nouvelle branche `"claude/can_use_tool"` →
  `{"interactionType":"approval","title": Bash→"Exécution de commande",
  Write/Edit/MultiEdit/NotebookEdit→"Modification de fichiers", sinon
  "Outil <display_name>", "detail": input.command | input.file_path |
  description (≤400 car.), "itemId": tool_use_id}`. Pas de `choices` → la
  réponse `{allow, scope}` existe déjà côté UI, et `scope:"session"` alimente
  `approval_sessions` (auto-allow des suivants, ws_router.rs ~1274).

## Tests (TDD, faux CLI shell dans un tmpdir comme `claude-fake-*`)

- `build_args` : contient `--input-format stream-json` + `--permission-prompt-tool stdio`,
  ne contient plus le prompt.
- Permission : faux CLI qui émet `system/init`, puis un `control_request
  can_use_tool`, puis lit UNE ligne sur stdin et la recopie dans un
  `assistant` texte, puis `result`. `on_interaction` factice renvoie
  `{"allow":true}` → la ligne recopiée contient `"behavior":"allow"` ; variante
  `None` → `"behavior":"deny"`.
- Steer : faux CLI qui émet `init`, dort 2 s en lisant stdin, recopie la 2e
  ligne reçue dans un `assistant` texte, puis `result`. `send` normal lancé en
  tâche ; après `init`, `send` en `SendMode::Steer` sur le même thread_id →
  retourne `ok:true` en < 500 ms, `__steered` émis, le texte du steer apparaît
  dans les événements du PREMIER tour, un seul `done`.
- Fermeture stdin après `result` : le faux CLI fait `cat >/dev/null` après le
  `result` — le tour doit se terminer (pas de blocage jusqu'au filet idle).
- send.rs : test existant `steer_capacite_tests` toujours vert ; supprimer /
  adapter tout test qui encodait le kill+resume claude.

## Vérification

`cargo test -p atelier-providers -p atelier-runtime`, puis relance
(docs/PROTOCOLE_RELANCE.md) et essai réel en mode Ask : Write d'un fichier →
carte d'approbation dans le chat → fichier créé après « Autoriser » ; steer
pendant un tour à plusieurs Bash → pris dans le tour.
