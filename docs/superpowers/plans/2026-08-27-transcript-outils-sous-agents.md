# Transcript outillé des sous-agents Codex — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le panneau d'un sous-agent Codex montre ce que l'agent FAIT (outils, patchs, MCP, raisonnement), plus seulement sa prose ; et les chips d'agents survivent au rechargement d'un fil quand l'historique natif gagne sur le journal.

**Architecture:** Une seule cause racine : `load_codex_history_from_base` (atelier-runtime) ne mappe que `user_message`/`agent_message` du rollout Codex sur disque. On étend ce parseur (Rust) aux items d'outils et de raisonnement, puis on lève le filtre d'affichage du panneau (React). Aucune plomberie nouvelle : la route WS `getAgentHistory` et le poll 2,5 s existent déjà.

**Tech Stack:** Rust (crate `atelier-runtime`, tests cargo), React/TypeScript (vitest + testing-library).

**Spec:** ce document (section « Contexte » ci-dessous) — issu de l'audit de session du 2026-08-26/27.

## Global Constraints

- Règle Rust-first du projet : toute logique nouvelle en Rust, jamais en Node (`CLAUDE.md`).
- `npx tsc --noEmit` et `npx vite build` doivent passer.
- Tests Rust : `cd rust && cargo test -p atelier-runtime --lib` (le manifest est `rust/Cargo.toml`, PAS la racine).
- Tests front : `npx vitest run src/components/chat` (et la suite complète avant de finir).
- Ne jamais pusher. Commits petits et tôt (des auto-commits balaient le worktree — committer soi-même d'abord).
- UI : système de design strict — aucune couleur en dur, tailles 10/11/12/13/15, icônes SVG monochromes existantes (`ToolGlyph`).
- Ne PAS modifier `prefer_richer_dialogue` (partagée avec grok) : son score ne compte que `text`/`user`, nos nouveaux événements ne le changent pas — c'est voulu et à vérifier par test.

## Contexte (à lire avant Task 1)

**Chaîne actuelle.** Panneau enfant : `AgentDetailPanel` ([src/components/chat/AgentActivity.tsx:206](../../../src/components/chat/AgentActivity.tsx)) filtre `events` sur `text|streaming|thinking|thinking_live|error`. Ces events viennent de `getAgentHistory` ([rust/crates/atelier-runtime/src/ws_router.rs:343](../../../rust/crates/atelier-runtime/src/ws_router.rs)) → `load_codex_history` ([rust/crates/atelier-runtime/src/codex_history.rs:132](../../../rust/crates/atelier-runtime/src/codex_history.rs)) qui lit `~/.codex/sessions/**/<session>.jsonl` et ne garde que `user_message`→`user` et `agent_message`→`text`.

**Formes réelles des items de rollout** (relevées sur les sessions du 2026-08-26 ; chaque ligne du jsonl est `{"type":"event_msg","payload":{...}}` ou porte le payload à la racine — le parseur actuel fait déjà `row.get("payload").unwrap_or(&row)`) :

```json
{"type":"custom_tool_call","id":"ctc_…","status":"completed","call_id":"call-…","name":"exec","input":"// @exec: …\nconst r = await tools.exec_command({…"}
{"type":"custom_tool_call_output","call_id":"call-…","output":"Script running…"}
{"type":"function_call","id":"fc_…","name":"wait","arguments":"{\"cell_id\":\"3\",…}","call_id":"call_…"}
{"type":"function_call_output","id":"fco_…","call_id":"call_…","output":"Wall time 31.0 seconds…"}
{"type":"mcp_tool_call_end","call_id":"exec-…","invocation":{"server":"scholar","tool":"search_papers","arguments":{…}},"duration":{"secs":62,…},"result":{"Ok":{"content":[{"type":"text","text":"## Resultats…"}]}}}
{"type":"patch_apply_end","call_id":"call_…","turn_id":"…","stdout":"Success. Updated the following files:\nM /path/methods_en.tex\n","stderr":"","success":true}
{"type":"agent_reasoning","text":"The user asks in French…"}
```

**Contrat de sortie** (celui du fil de chat, voir `AgentEvent` dans [src/lib/ws.ts](../../../src/lib/ws.ts)) : `{"kind":"tool_update","id":…,"name":…,"detail":…,"input":{…},"output":…,"status":"completed"|"failed"}` et `{"kind":"thinking","text":…}`.

**Chips.** `isAgentActivityAction` = `kind=="tool_update" && agentActivity != null` ([AgentActivity.tsx:31](../../../src/components/chat/AgentActivity.tsx)). Le journal Atelier les conserve, mais quand `getHistory` (parent, [ws_router.rs:274](../../../rust/crates/atelier-runtime/src/ws_router.rs)) préfère le natif (plus riche en `text`), tout ce que le parseur natif ne mappe pas disparaît — chips comprises. Le rollout parent journalise les appels collab comme `function_call` avec `name` ∈ {`spawn_agent`,`wait`,`send_input`,`resume_agent`,`close_agent`} et des `arguments` JSON-encodés.

---

### Task 1: Parseur de rollout — items d'outils

**Files:**
- Modify: `rust/crates/atelier-runtime/src/codex_history.rs` (fonction `load_codex_history_from_base`, lignes ~132-175, et module de tests en bas de fichier)

**Interfaces:**
- Consumes: les formes de payload citées dans « Contexte ».
- Produces: `load_codex_history_from_base(base, id) -> Vec<Value>` émettant, EN PLUS des `user`/`text` actuels (inchangés, même strip), des événements :
  - `{"kind":"tool_update","id":<call_id>,"name":<name>,"detail":<première ligne non vide de input/arguments, 120 chars max>,"input":{"raw":<input|arguments>},"output":<output borné>,"status":"completed"}` pour `custom_tool_call`+`custom_tool_call_output` et `function_call`+`function_call_output` appariés par `call_id` ;
  - `{"kind":"tool_update","id":<call_id>,"name":"<server>/<tool>","input":<invocation.arguments>,"output":<texte de result borné>,"status":"completed"|"failed"}` pour `mcp_tool_call_end` (`failed` si `result.Err` présent) ;
  - `{"kind":"tool_update","id":<call_id>,"name":"apply_patch","output":<stdout borné>,"status":"completed"|"failed"}` selon `success` pour `patch_apply_end` ;
  - `{"kind":"thinking","text":<text>}` pour `agent_reasoning` (ignorer les `reasoning` à `encrypted_content` sans texte).
  - Borne de sortie : `const NATIVE_TOOL_OUTPUT_MAX: usize = 8_000;` en CARACTÈRES (`chars().take(...)`), pour ne jamais couper un point de code.

- [ ] **Step 1: Écrire le test qui échoue**

Dans le module `tests` de `codex_history.rs`, à côté de `lists_and_reads_native_codex_rollouts` (réutiliser son gabarit `write_rollout`/tempdir) :

```rust
    /// Le panneau d'un sous-agent doit montrer ce que l'agent FAIT : le
    /// parseur mappe les items d'outils du rollout, pas seulement la prose.
    #[test]
    fn maps_tool_items_from_rollout() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        let path = rollout_path(dir.path(), id); // extraire du gabarit existant
        let mut file = File::create(&path).unwrap();
        writeln!(file, "{}", json!({"type":"session_meta","payload":{"id": id, "cwd":"/tmp/projet"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call","status":"completed","call_id":"c1","name":"exec","input":"const r = await tools.exec_command({cmd: \"wc -l a.py\"})"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call_output","call_id":"c1","output":"42 a.py\n"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_reasoning","text":"Je compte les lignes."}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"mcp_tool_call_end","call_id":"m1","invocation":{"server":"scholar","tool":"search_papers","arguments":{"query":"albedo"}},"result":{"Ok":{"content":[{"type":"text","text":"3 articles"}]}}}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"patch_apply_end","call_id":"p1","stdout":"Success. Updated a.py\n","stderr":"","success":true}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_message","message":"Fini."}})).unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let kinds: Vec<&str> = events.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["tool_update", "thinking", "tool_update", "tool_update", "text"]);
        assert_eq!(events[0]["id"], "c1");
        assert_eq!(events[0]["name"], "exec");
        assert_eq!(events[0]["output"], "42 a.py\n");
        assert_eq!(events[0]["status"], "completed");
        assert_eq!(events[1]["text"], "Je compte les lignes.");
        assert_eq!(events[2]["name"], "scholar/search_papers");
        assert_eq!(events[2]["output"], "3 articles");
        assert_eq!(events[3]["name"], "apply_patch");
        assert_eq!(events[3]["status"], "completed");
    }
```

Nota : l'événement `tool_update` de l'appel apparié s'émet AU MOMENT DE L'OUTPUT (un seul événement par appel, pas un à l'appel + un à la sortie) ; un appel resté sans output à la fin du fichier s'émet en `status:"completed"` avec `output:""` lors d'une passe finale sur la map.

- [ ] **Step 2: Vérifier l'échec** — `cd rust && cargo test -p atelier-runtime --lib maps_tool_items` → FAIL (kinds = `["text"]`).

- [ ] **Step 3: Implémenter** dans la boucle de `load_codex_history_from_base` : un `HashMap<String, Value>` `pending_calls` (call_id → {name, input}) rempli par `custom_tool_call`/`function_call` ; `custom_tool_call_output`/`function_call_output` retirent l'entrée et poussent le `tool_update` ; bras directs pour `mcp_tool_call_end`, `patch_apply_end`, `agent_reasoning` ; passe finale qui vide `pending_calls` dans l'ordre d'insertion (utiliser un `Vec<(String, Value)>` en parallèle ou `indexmap` N'EST PAS dispo — préférer `Vec` + recherche linéaire, les rollouts ont < 10³ appels).

- [ ] **Step 4: Vérifier** — même commande → PASS, et `cargo test -p atelier-runtime --lib` entier vert (les deux tests existants du module ne doivent pas bouger).

- [ ] **Step 5: Commit** — `git add rust/crates/atelier-runtime/src/codex_history.rs && git commit -m "feat(runtime): mapper les items d'outils des rollouts Codex"`

### Task 2: Parseur de rollout — appels collab (chips après reload)

**Files:**
- Modify: `rust/crates/atelier-runtime/src/codex_history.rs` (mêmes fonctions ; s'appuie sur la map de Task 1)

**Interfaces:**
- Consumes: `function_call` dont `name` ∈ {`spawn_agent`, `wait`, `send_input`, `resume_agent`, `close_agent`} (+ leurs `function_call_output`).
- Produces: pour ces appels, le `tool_update` de Task 1 enrichi : `name` devient `"agent:<name>"` et l'événement porte `"agentActivity": {"tool": <name>, "receiverThreadIds": <ids>, "agentsStates": {<id>: {"status": "running", "message": null}}}` — où `<ids>` vient des `arguments` JSON-décodés : clé `agent_thread_ids` (liste) ou `agent_thread_id` (chaîne), sinon liste vide. C'est le contrat de `isAgentActivityAction` ([AgentActivity.tsx:31](../../../src/components/chat/AgentActivity.tsx)) : `kind=="tool_update" && agentActivity != null` ⇒ les chips repeuplent.

- [ ] **Step 1: Test qui échoue** (même module) :

```rust
    /// Après un reload où l'historique natif gagne sur le journal, les chips
    /// de sous-agents doivent repeupler : les appels collab du rollout
    /// produisent des tool_update porteurs d'agentActivity.
    #[test]
    fn maps_collab_calls_with_agent_activity() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(file, "{}", json!({"type":"session_meta","payload":{"id": id, "cwd":"/tmp"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call","name":"spawn_agent","call_id":"s1","arguments":"{\"prompt\":\"cherche X\"}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call_output","call_id":"s1","output":"{\"agent_thread_id\":\"child-42\"}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call","name":"wait","call_id":"w1","arguments":"{\"agent_thread_ids\":[\"child-42\"]}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call_output","call_id":"w1","output":"done"}})).unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(events[0]["name"], "agent:spawn_agent");
        assert_eq!(events[0]["agentActivity"]["receiverThreadIds"][0], "child-42");
        assert_eq!(events[1]["name"], "agent:wait");
        assert_eq!(events[1]["agentActivity"]["agentsStates"]["child-42"]["status"], "running");
    }
```

Nota `spawn_agent` : l'id de l'enfant n'est pas dans `arguments` mais dans l'OUTPUT (`{"agent_thread_id":"child-42"}`) — le décoder aussi (JSON d'abord, sinon regex `[0-9a-f-]{36}` en repli, sinon liste vide sans paniquer).

- [ ] **Step 2: FAIL attendu** (`name` vaut `"spawn_agent"`, pas de `agentActivity`).
- [ ] **Step 3: Implémenter** — au moment d'émettre le `tool_update` apparié : si le nom est collab, préfixer `agent:` et construire `agentActivity`.
- [ ] **Step 4: PASS** + suite `atelier-runtime` entière verte.
- [ ] **Step 5: Commit** — `git commit -m "feat(runtime): rejouer les appels collab en agentActivity (chips après reload)"`

### Task 3: Panneau enfant — afficher l'activité

**Files:**
- Modify: `src/components/chat/AgentActivity.tsx` (le filtre ligne ~206 et le rendu du transcript)
- Modify: `src/App.css` (styles `.agent-tool-line`, si besoin — tokens uniquement)
- Test: `src/components/chat/AgentActivity.test.tsx`

**Interfaces:**
- Consumes: les événements de Task 1 via `events` du panneau (`getAgentHistory` les livre tels quels), et les helpers existants `ToolGlyph`/`activityIconForAction` ou `semanticActivity` de [src/components/chat/toolPresentation.tsx](../../../src/components/chat/toolPresentation.tsx) — l'exécuteur choisit le plus simple des deux, en LES RÉUTILISANT (pas de nouvelle iconographie).
- Produces: dans `AgentDetailPanel`, les `tool_update` du transcript rendus en lignes compactes une-ligne (icône monochrome + `name`/`detail`, classe `is-failed` si `status==="failed"`), interlacées à leur position réelle entre les blocs de prose ; `thinking` rendu comme aujourd'hui (le kind est déjà dans le filtre).

- [ ] **Step 1: Test qui échoue** (dans `AgentActivity.test.tsx`, gabarit des tests existants) :

```tsx
  it("le panneau montre les outils de l'enfant, pas seulement sa prose", () => {
    render(<AgentDetailPanel
      agent={{ threadId: "child-1", displayName: "Chercheur", status: "working",
        statusMessage: null, prompt: null, model: null, reasoningEffort: null, agentPath: null }}
      onClose={() => {}}
      events={[
        { kind: "tool_update", id: "c1", name: "exec", detail: "wc -l a.py", output: "42 a.py", status: "completed" } as AgentEvent,
        { kind: "text", text: "Fini." } as AgentEvent,
      ]}
    />);
    const ligne = screen.getByTestId("agent-tool-line");
    expect(ligne.textContent).toContain("wc -l a.py");
    expect(screen.getByText("Fini.")).toBeTruthy();
  });
```

- [ ] **Step 2: FAIL** (`agent-tool-line` absent — le filtre jette les tool_update).
- [ ] **Step 3: Implémenter** — élargir le filtre à `tool` et `tool_update` (PAS `user` : la route l'exclut déjà ; PAS les `agent:*` collab de l'enfant — les exclure par `!event.name?.startsWith("agent:")` pour ne pas imbriquer des chips dans le panneau), et rendre la ligne compacte `data-testid="agent-tool-line"`.
- [ ] **Step 4: PASS** + `npx vitest run src/components/chat` vert + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(chat): activité outillée dans le panneau de sous-agent"`

### Task 4: Caractérisation bout-en-bout de getHistory

**Files:**
- Modify: `rust/crates/atelier-runtime/src/ws_router.rs` (module de tests seulement — le test existant ligne ~4421 sert de gabarit)

**Interfaces:**
- Consumes: Tasks 1-2. Aucune production nouvelle — c'est le verrou anti-régression : quand le natif gagne le score de `prefer_richer_dialogue`, les événements d'agents doivent désormais survivre.

- [ ] **Step 1: Test** : un fil codex avec `session_id` pointé sur un rollout tempdir contenant 2 `agent_message` + 1 `function_call` `spawn_agent` apparié, journal quasi vide (1 seul `text`) ; appeler `route_ws(getHistory)` et vérifier que la réponse contient l'événement `agent:spawn_agent` AVEC `agentActivity`. (S'inspirer du test `getHistory` existant pour le montage de l'état ; si le montage exige trop de plomberie de threads-store, tester au niveau `prefer_richer_dialogue(journal, native)` directement avec le natif produit par `load_codex_history_from_base` — le point vérifié est le même.)
- [ ] **Step 2-4:** FAIL sans Tasks 1-2 appliquées n'est pas exigible (elles le précèdent) — ce test doit passer DU PREMIER COUP ; s'il échoue, c'est un bug des tâches précédentes à corriger avant de continuer.
- [ ] **Step 5: Commit** — `git commit -m "test(runtime): getHistory codex préserve l'activité des sous-agents"`

### Task 5: Validation finale

- [ ] `cd rust && cargo test -p atelier-runtime --lib` — tout vert.
- [ ] `npx vitest run src/components` — tout vert.
- [ ] `npx tsc --noEmit` (ignorer `src/test_auto_review*.ts`) et `npx vite build` — verts.
- [ ] `cd sidecar && npx vitest run` — tout vert (aucun fichier sidecar touché, mais la parité est un invariant du repo).
- [ ] NE PAS relancer l'app (protocole PROTOCOLE_RELANCE.md) — la relance est faite par la session principale après revue.
- [ ] Commit final si des miettes restent, message `feat: transcript outillé des sous-agents Codex`.
