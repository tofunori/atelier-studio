# Atelier Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App macOS Tauri 2 avec chat multi-provider (Claude + Codex, via leurs SDKs dans un sidecar Node) à gauche et la galerie atelier (cmux-gallery) en webview à droite, sidebar projets → threads parallèles.

**Architecture:** Shell Tauri 2 (Rust) qui (1) lance le serveur atelier du projet (`cmux_gallery.py run --no-open`) et (2) spawn un sidecar Node hébergeant `@anthropic-ai/claude-agent-sdk` et `@openai/codex-sdk` derrière une interface `AgentProvider`, exposé au frontend React par WebSocket local. Les threads sont persistés dans un index JSON ; les sessions elles-mêmes vivent côté SDKs (resume par `session_id`).

**Tech Stack:** Tauri 2, Rust, React 18 + TypeScript + Vite, `react-resizable-panels`, `react-markdown`, Node ≥ 20 (ESM), `ws`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, vitest, `fix-path-env` (crate).

## Global Constraints

- macOS uniquement ; l'app réutilise les logins CLI existants (`claude`, `codex`) — aucune clé API stockée.
- Atelier n'est **jamais modifié** ; on l'exécute tel quel : `python3 ~/Documents/cmux-gallery/cmux_gallery.py run --root <projet> --no-open`. Port stable = `8790 + (md5(realpath(root)) % 1000)` ; santé via `GET http://127.0.0.1:<port>/ping`.
- Toujours hydrater le PATH du login shell (apps GUI macOS = env strippé) : `fix_path_env::fix()` côté Rust, et le sidecar hérite de cet env.
- Index des threads : `~/Library/Application Support/atelier-studio/threads.json`.
- Permission mode v1 : « full access » (`bypassPermissions` pour Claude ; sandbox off pour Codex), toggle par thread.
- ⚠️ Les signatures exactes des deux SDKs évoluent : à chaque tâche provider, vérifier contre la doc du paquet installé (`node_modules/.../README`) avant de coder ; les squelettes ci-dessous donnent la forme attendue.

---

### Task 1: Scaffold Tauri 2 + React + repo

**Files:**
- Create: racine du repo via scaffold (`package.json`, `src/`, `src-tauri/`, `vite.config.ts`, …)
- Create: `.gitignore`

**Interfaces:**
- Produces: app Tauri qui compile et ouvre une fenêtre vide ; base pour toutes les tâches suivantes.

- [ ] **Step 1: Scaffolder dans le repo existant**

```bash
cd ~/Documents/atelier-studio
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
npm install
npm install react-resizable-panels react-markdown
```

- [ ] **Step 2: Vérifier que l'app démarre**

Run: `npm run tauri dev` (laisser ouvrir la fenêtre, puis Ctrl-C)
Expected: fenêtre « Welcome to Tauri » s'ouvre sans erreur.

- [ ] **Step 3: .gitignore + commit**

```gitignore
node_modules/
dist/
src-tauri/target/
sidecar/node_modules/
.DS_Store
```

```bash
git add -A && git commit -m "chore: scaffold Tauri 2 + React-TS"
```

---

### Task 2: Rust — port atelier + commande start_atelier

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/atelier.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: commande Tauri `start_atelier(root: String) -> Result<String, String>` retournant l'URL de la galerie ; fn `project_port(root: &Path) -> u16` (testée).

- [ ] **Step 1: Dépendances Cargo**

Dans `[dependencies]` de `src-tauri/Cargo.toml`, ajouter :

```toml
md5 = "0.7"
fix-path-env = { git = "https://github.com/tauri-apps/fix-path-env-rs" }
```

- [ ] **Step 2: Test du calcul de port (doit échouer)**

`src-tauri/src/atelier.rs` :

```rust
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn port_is_stable_and_in_range() {
        let p = project_port(Path::new("/tmp"));
        assert_eq!(p, project_port(Path::new("/tmp")));
        assert!((8790..=9789).contains(&p));
    }
}
```

Run: `cd src-tauri && cargo test`
Expected: FAIL — `project_port` non défini.

- [ ] **Step 3: Implémentation**

Compléter `src-tauri/src/atelier.rs` (même algo que `cmux_gallery.py::project_port` — md5 du realpath, interprété comme grand entier, mod 1000) :

```rust
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

pub fn project_port(root: &Path) -> u16 {
    let real: PathBuf = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let digest = md5::compute(real.to_string_lossy().as_bytes());
    // python: int(hexdigest, 16) % 1000 — équivaut au mod 1000 des 16 octets big-endian
    let rem = digest.0.iter().fold(0u64, |acc, b| (acc * 256 + *b as u64) % 1000);
    8790 + rem as u16
}

fn ping(port: u16) -> bool {
    let url = format!("127.0.0.1:{port}");
    std::net::TcpStream::connect_timeout(
        &url.parse().unwrap(), Duration::from_millis(500)).is_ok()
}

#[tauri::command]
pub fn start_atelier(root: String) -> Result<String, String> {
    let root_path = Path::new(&root);
    let port = project_port(root_path);
    if !ping(port) {
        let gallery = dirs::home_dir().ok_or("no home")?
            .join("Documents/cmux-gallery/cmux_gallery.py");
        Command::new("python3")
            .arg(gallery).arg("run")
            .arg("--root").arg(&root)
            .arg("--no-open")
            .spawn().map_err(|e| e.to_string())?;
        // le serveur se détache; on attend qu'il réponde (max ~15 s, build inclus)
        for _ in 0..60 {
            if ping(port) { break; }
            std::thread::sleep(Duration::from_millis(250));
        }
        if !ping(port) { return Err(format!("atelier ne répond pas sur {port}")); }
    }
    Ok(format!("http://127.0.0.1:{port}/figures_index.html"))
}
```

Ajouter `dirs = "5"` aux dépendances Cargo. Dans `src-tauri/src/lib.rs`, au début de `run()` : `let _ = fix_path_env::fix();` et enregistrer la commande :

```rust
.invoke_handler(tauri::generate_handler![atelier::start_atelier])
```

avec `mod atelier;` en tête de fichier.

- [ ] **Step 4: Tests**

Run: `cd src-tauri && cargo test`
Expected: PASS (1 test).

Vérification croisée du port avec Python :

```bash
python3 ~/Documents/cmux-gallery/cmux_gallery.py status --root ~/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis 2>&1 | head -3
```

Comparer le port affiché avec `project_port` (ajouter un `println!` temporaire dans le test si besoin) — ils doivent être identiques.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rust): start_atelier — lance/réutilise le serveur galerie du projet"
```

---

### Task 3: Sidecar Node — serveur WS + routeur de messages

**Files:**
- Create: `sidecar/package.json`, `sidecar/index.mjs`, `sidecar/router.mjs`
- Test: `sidecar/router.test.mjs`

**Interfaces:**
- Produces: process `node sidecar/index.mjs` qui affiche `{"port":N}` sur stdout puis sert un WebSocket ; protocole JSON : client→sidecar `{type, threadId?, ...}`, sidecar→client `{type:"event"|"error"|"pong"|"threads", ...}` ; `route(msg, ctx)` pur et testé.

- [ ] **Step 1: Init + test du routeur (échec attendu)**

```bash
cd sidecar && npm init -y && npm pkg set type=module && npm install ws && npm install -D vitest
```

`sidecar/router.test.mjs` :

```js
import { describe, it, expect } from "vitest";
import { route } from "./router.mjs";

describe("route", () => {
  it("répond pong au ping", async () => {
    const sent = [];
    await route({ type: "ping" }, { send: (m) => sent.push(m) });
    expect(sent).toEqual([{ type: "pong" }]);
  });
  it("signale un type inconnu", async () => {
    const sent = [];
    await route({ type: "nope" }, { send: (m) => sent.push(m) });
    expect(sent[0].type).toBe("error");
  });
});
```

Run: `npx vitest run`
Expected: FAIL — `router.mjs` absent.

- [ ] **Step 2: Implémentation minimale**

`sidecar/router.mjs` :

```js
// ctx: { send(obj), providers?, store? } — enrichi par les tâches suivantes
export async function route(msg, ctx) {
  switch (msg.type) {
    case "ping":
      ctx.send({ type: "pong" });
      break;
    default:
      ctx.send({ type: "error", message: `type inconnu: ${msg.type}` });
  }
}
```

`sidecar/index.mjs` :

```js
import { WebSocketServer } from "ws";
import { route } from "./router.mjs";

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("listening", () => {
  console.log(JSON.stringify({ port: wss.address().port }));
});
wss.on("connection", (ws) => {
  const ctx = { send: (obj) => ws.send(JSON.stringify(obj)) };
  ws.on("message", async (data) => {
    let msg;
    try { msg = JSON.parse(data); }
    catch { return ctx.send({ type: "error", message: "JSON invalide" }); }
    try { await route(msg, ctx); }
    catch (e) { ctx.send({ type: "error", threadId: msg.threadId, message: String(e) }); }
  });
});
```

- [ ] **Step 3: Tests verts + smoke**

Run: `npx vitest run` → PASS (2 tests).
Smoke : `node index.mjs` doit imprimer `{"port":<n>}` (Ctrl-C ensuite).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(sidecar): serveur WS + routeur de messages testé"
```

---

### Task 4: Sidecar — store des threads (index JSON persistant)

**Files:**
- Create: `sidecar/store.mjs`
- Test: `sidecar/store.test.mjs`
- Modify: `sidecar/router.mjs`

**Interfaces:**
- Produces: `class ThreadStore(filePath)` avec `list()`, `upsert(thread)`, `get(id)` ; thread = `{id, projectRoot, title, provider, sessionId, status: "idle"|"running"|"done", updatedAt}`. Message WS `{type:"listThreads"}` → `{type:"threads", threads:[...]}`.

- [ ] **Step 1: Test (échec attendu)**

`sidecar/store.test.mjs` :

```js
import { describe, it, expect } from "vitest";
import { ThreadStore } from "./store.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ThreadStore", () => {
  it("persiste et relit les threads", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    const s = new ThreadStore(file);
    s.upsert({ id: "t1", projectRoot: "/p", title: "alo", provider: "claude",
               sessionId: null, status: "idle" });
    const s2 = new ThreadStore(file);
    expect(s2.get("t1").title).toBe("alo");
    expect(s2.list()).toHaveLength(1);
  });
  it("upsert met à jour sans dupliquer", () => {
    const file = join(mkdtempSync(join(tmpdir(), "as-")), "threads.json");
    const s = new ThreadStore(file);
    s.upsert({ id: "t1", title: "a" });
    s.upsert({ id: "t1", title: "b", status: "running" });
    expect(s.list()).toHaveLength(1);
    expect(s.get("t1").title).toBe("b");
  });
});
```

Run: `npx vitest run` → FAIL.

- [ ] **Step 2: Implémentation**

`sidecar/store.mjs` :

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export class ThreadStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.threads = new Map();
    if (existsSync(filePath)) {
      for (const t of JSON.parse(readFileSync(filePath, "utf8"))) {
        this.threads.set(t.id, t);
      }
    }
  }
  list() { return [...this.threads.values()]
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")); }
  get(id) { return this.threads.get(id); }
  upsert(patch) {
    const prev = this.threads.get(patch.id) ?? {};
    const t = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    this.threads.set(t.id, t);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.list(), null, 2));
    return t;
  }
}
```

- [ ] **Step 3: Brancher au routeur**

Dans `sidecar/index.mjs`, créer le store et le passer dans `ctx` :

```js
import { ThreadStore } from "./store.mjs";
import { homedir } from "node:os";
const store = new ThreadStore(
  `${homedir()}/Library/Application Support/atelier-studio/threads.json`);
// dans connection: const ctx = { send: ..., store };
```

Dans `sidecar/router.mjs`, ajouter le case :

```js
    case "listThreads":
      ctx.send({ type: "threads", threads: ctx.store.list() });
      break;
```

- [ ] **Step 4: Tests + commit**

Run: `npx vitest run` → PASS (4 tests).

```bash
git add -A && git commit -m "feat(sidecar): ThreadStore persistant + listThreads"
```

---

### Task 5: Sidecar — provider Claude (Agent SDK, streaming + resume)

**Files:**
- Create: `sidecar/providers/claude.mjs`
- Modify: `sidecar/router.mjs`, `sidecar/index.mjs`

**Interfaces:**
- Consumes: `ThreadStore` (Task 4), routeur (Task 3).
- Produces: interface commune provider — `run({ threadId, cwd, prompt, sessionId, onEvent }) -> Promise<{sessionId}>` où `onEvent` reçoit `{kind:"text"|"tool"|"done"|"error", ...}` ; messages WS `{type:"send", threadId, projectRoot, provider, prompt}` → flux `{type:"event", threadId, event}` + `{type:"threads", ...}` (statuts).

- [ ] **Step 1: Installer le SDK et lire sa doc installée**

```bash
cd sidecar && npm install @anthropic-ai/claude-agent-sdk
sed -n 1,80p node_modules/@anthropic-ai/claude-agent-sdk/README.md
```

Ajuster les noms exacts (`query`, forme des messages, option `resume`) d'après ce README si différents du squelette ci-dessous.

- [ ] **Step 2: Implémentation**

`sidecar/providers/claude.mjs` :

```js
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function run({ cwd, prompt, sessionId, onEvent }) {
  let sid = sessionId ?? null;
  const q = query({
    prompt,
    options: {
      cwd,
      permissionMode: "bypassPermissions",
      ...(sessionId ? { resume: sessionId } : {}),
    },
  });
  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init") sid = msg.session_id;
    if (msg.type === "assistant") {
      for (const block of msg.message.content ?? []) {
        if (block.type === "text") onEvent({ kind: "text", text: block.text });
        if (block.type === "tool_use") onEvent({ kind: "tool", name: block.name });
      }
    }
    if (msg.type === "result") {
      onEvent({ kind: "done", ok: msg.subtype === "success", result: msg.result ?? "" });
    }
  }
  return { sessionId: sid };
}
```

- [ ] **Step 3: Routeur — case `send` (générique, providers injectés)**

Dans `sidecar/router.mjs` :

```js
    case "send": {
      const { threadId, projectRoot, provider, prompt, title } = msg;
      const p = ctx.providers[provider];
      if (!p) return ctx.send({ type: "error", threadId, message: `provider inconnu: ${provider}` });
      const prev = ctx.store.get(threadId);
      ctx.store.upsert({ id: threadId, projectRoot, provider,
        title: prev?.title ?? title ?? prompt.slice(0, 40), status: "running" });
      ctx.send({ type: "threads", threads: ctx.store.list() });
      // fire-and-forget: plusieurs threads streament en parallèle
      p.run({
        threadId, cwd: projectRoot, prompt,
        sessionId: prev?.sessionId ?? null,
        onEvent: (event) => ctx.send({ type: "event", threadId, event }),
      }).then(({ sessionId }) => {
        ctx.store.upsert({ id: threadId, sessionId, status: "done" });
        ctx.send({ type: "threads", threads: ctx.store.list() });
      }).catch((e) => {
        ctx.store.upsert({ id: threadId, status: "idle" });
        ctx.send({ type: "event", threadId, event: { kind: "error", message: String(e) } });
      });
      break;
    }
```

Dans `sidecar/index.mjs` :

```js
import * as claude from "./providers/claude.mjs";
const providers = { claude };
// ctx = { send, store, providers }
```

- [ ] **Step 4: Test manuel bout-en-bout du provider**

```bash
node --input-type=module -e '
import { run } from "./providers/claude.mjs";
const { sessionId } = await run({ cwd: process.env.HOME, prompt: "Réponds juste: OK",
  onEvent: (e) => console.log(e) });
console.log("session:", sessionId);
' # exécuter depuis sidecar/
```

Expected: événements `{kind:"text",...}` puis `{kind:"done", ok:true}` et un `session:` non nul. (Consomme un tour de ton abonnement Claude — normal.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(sidecar): provider Claude (Agent SDK) streaming + resume"
```

---

### Task 6: Sidecar — provider Codex

**Files:**
- Create: `sidecar/providers/codex.mjs`
- Modify: `sidecar/index.mjs`

**Interfaces:**
- Consumes: contrat provider de Task 5 (`run({threadId, cwd, prompt, sessionId, onEvent}) -> {sessionId}`).
- Produces: `providers.codex` avec le même contrat (le `sessionId` stocké = thread id Codex).

- [ ] **Step 1: Installer + lire la doc installée**

```bash
cd sidecar && npm install @openai/codex-sdk
sed -n 1,80p node_modules/@openai/codex-sdk/README.md
```

Ajuster les noms exacts (`startThread`/`resumeThread`, `runStreamed`, forme des events) d'après ce README.

- [ ] **Step 2: Implémentation**

`sidecar/providers/codex.mjs` :

```js
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();

export async function run({ cwd, prompt, sessionId, onEvent }) {
  const thread = sessionId
    ? codex.resumeThread(sessionId)
    : codex.startThread({ workingDirectory: cwd, skipGitRepoCheck: true });
  const { events } = await thread.runStreamed(prompt);
  for await (const ev of events) {
    if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
      onEvent({ kind: "text", text: ev.item.text ?? "" });
    }
    if (ev.type === "item.completed" && ev.item?.type === "command_execution") {
      onEvent({ kind: "tool", name: ev.item.command ?? "commande" });
    }
    if (ev.type === "turn.completed") onEvent({ kind: "done", ok: true, result: "" });
    if (ev.type === "turn.failed") onEvent({ kind: "error", message: ev.error?.message ?? "échec" });
  }
  return { sessionId: thread.id ?? sessionId };
}
```

Dans `sidecar/index.mjs` : `import * as codexP from "./providers/codex.mjs";` et `const providers = { claude, codex: codexP };`

- [ ] **Step 3: Test manuel**

Même pattern que Task 5 Step 4 avec `./providers/codex.mjs` et le prompt « Réponds juste: OK ».
Expected: `{kind:"text"...}`, `{kind:"done"}`, session non nulle.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(sidecar): provider Codex (Codex SDK)"
```

---

### Task 7: Rust — spawn du sidecar + port exposé au frontend

**Files:**
- Create: `src-tauri/src/sidecar.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: `sidecar/index.mjs` qui imprime `{"port":N}` (Task 3).
- Produces: commande Tauri `sidecar_port() -> Result<u16, String>` (spawn au premier appel, mémorisé) ; le frontend fera `invoke("sidecar_port")` puis `new WebSocket("ws://127.0.0.1:"+port)`.

- [ ] **Step 1: Implémentation**

`src-tauri/src/sidecar.rs` :

```rust
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;

static PORT: Mutex<Option<u16>> = Mutex::new(None);

#[tauri::command]
pub fn sidecar_port(app: tauri::AppHandle) -> Result<u16, String> {
    let mut guard = PORT.lock().unwrap();
    if let Some(p) = *guard { return Ok(p); }
    // dev: sidecar/ à la racine du repo ; bundle: dans les ressources
    let dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let script = dir.join("../sidecar/index.mjs");
    let script = if script.exists() { script } else {
        tauri::Manager::path(&app).resource_dir().map_err(|e| e.to_string())?
            .join("sidecar/index.mjs")
    };
    let mut child = Command::new("node")
        .arg(&script)
        .stdout(Stdio::piped())
        .spawn().map_err(|e| format!("spawn sidecar: {e}"))?;
    let stdout = child.stdout.take().ok_or("pas de stdout")?;
    let mut line = String::new();
    BufReader::new(stdout).read_line(&mut line).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(line.trim()).map_err(|e| e.to_string())?;
    let port = v["port"].as_u64().ok_or("port manquant")? as u16;
    *guard = Some(port);
    Ok(port)
}
```

Ajouter `serde_json = "1"` aux dépendances Cargo (si absent). Dans `lib.rs` : `mod sidecar;` et ajouter `sidecar::sidecar_port` au `generate_handler!`. Dans `tauri.conf.json`, ajouter le sidecar aux ressources du bundle :

```json
"bundle": { "resources": { "../sidecar/": "sidecar/" } }
```

- [ ] **Step 2: Vérifier compile + smoke**

Run: `cd src-tauri && cargo build`
Expected: compile sans erreur. Puis `npm run tauri dev`, ouvrir la console web (View → Developer Tools) et exécuter :

```js
const { invoke } = window.__TAURI__.core;
invoke("sidecar_port").then(console.log)
```

Expected: un numéro de port (ex. 54xxx).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(rust): spawn du sidecar Node et exposition du port"
```

---

### Task 8: Frontend — layout 3 panneaux, sidebar threads, chat, atelier

**Files:**
- Create: `src/lib/ws.ts`, `src/components/Sidebar.tsx`, `src/components/Chat.tsx`, `src/components/AtelierPane.tsx`
- Modify: `src/App.tsx`, `src/App.css`

**Interfaces:**
- Consumes: `invoke("sidecar_port")`, `invoke("start_atelier", { root })`, protocole WS des Tasks 3-6.
- Produces: UI complète v1.

- [ ] **Step 1: Client WS typé**

`src/lib/ws.ts` :

```ts
import { invoke } from "@tauri-apps/api/core";

export type AgentEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "done"; ok: boolean; result: string }
  | { kind: "error"; message: string };

export type Thread = {
  id: string; projectRoot: string; title: string;
  provider: "claude" | "codex"; sessionId: string | null;
  status: "idle" | "running" | "done"; updatedAt: string;
};

type Handler = (msg: any) => void;

export async function connectSidecar(onMessage: Handler): Promise<WebSocket> {
  const port = await invoke<number>("sidecar_port");
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ type: "listThreads" }));
  return ws;
}

export function sendPrompt(ws: WebSocket, t: {
  threadId: string; projectRoot: string; provider: string; prompt: string;
}) {
  ws.send(JSON.stringify({ type: "send", ...t }));
}
```

- [ ] **Step 2: App — état global + 3 panneaux**

`src/App.tsx` :

```tsx
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { connectSidecar, sendPrompt, Thread, AgentEvent } from "./lib/ws";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import AtelierPane from "./components/AtelierPane";
import "./App.css";

export default function App() {
  const ws = useRef<WebSocket | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [atelierUrl, setAtelierUrl] = useState<string | null>(null);
  const [showAtelier, setShowAtelier] = useState(true);

  useEffect(() => {
    connectSidecar((msg) => {
      if (msg.type === "threads") setThreads(msg.threads);
      if (msg.type === "event") setEvents((prev) => ({
        ...prev, [msg.threadId]: [...(prev[msg.threadId] ?? []), msg.event],
      }));
      if (msg.type === "error") console.error("sidecar:", msg.message);
    }).then((s) => { ws.current = s; });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "a") {
        setShowAtelier((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openProject() {
    const root = await open({ directory: true });
    if (typeof root !== "string") return;
    setProjectRoot(root);
    setAtelierUrl(await invoke<string>("start_atelier", { root }));
  }

  function newThread() {
    if (!projectRoot) return;
    const id = crypto.randomUUID();
    setActiveId(id);
    setEvents((p) => ({ ...p, [id]: [] }));
  }

  function submit(prompt: string, provider: "claude" | "codex") {
    if (!ws.current || !projectRoot || !activeId) return;
    setEvents((p) => ({
      ...p, [activeId]: [...(p[activeId] ?? []), { kind: "text", text: `**Toi :** ${prompt}` }],
    }));
    sendPrompt(ws.current, { threadId: activeId, projectRoot, provider, prompt });
  }

  return (
    <PanelGroup direction="horizontal" className="app">
      <Panel defaultSize={16} minSize={12}>
        <Sidebar threads={threads.filter((t) => !projectRoot || t.projectRoot === projectRoot)}
                 projectRoot={projectRoot} activeId={activeId}
                 onOpenProject={openProject} onSelect={setActiveId} onNew={newThread} />
      </Panel>
      <PanelResizeHandle className="handle" />
      <Panel minSize={30}>
        <Chat events={activeId ? events[activeId] ?? [] : []}
              disabled={!projectRoot || !activeId} onSubmit={submit} />
      </Panel>
      {showAtelier && atelierUrl && (<>
        <PanelResizeHandle className="handle" />
        <Panel defaultSize={38} minSize={20}>
          <AtelierPane url={atelierUrl} />
        </Panel>
      </>)}
    </PanelGroup>
  );
}
```

Installer le plugin dialog : `npm run tauri add dialog`.

- [ ] **Step 3: Composants**

`src/components/Sidebar.tsx` :

```tsx
import { Thread } from "../lib/ws";

export default function Sidebar(p: {
  threads: Thread[]; projectRoot: string | null; activeId: string | null;
  onOpenProject: () => void; onSelect: (id: string) => void; onNew: () => void;
}) {
  return (
    <div className="sidebar">
      <button onClick={p.onOpenProject}>
        {p.projectRoot ? p.projectRoot.split("/").pop() : "Ouvrir un projet…"}
      </button>
      <button onClick={p.onNew} disabled={!p.projectRoot}>+ Nouveau thread</button>
      <ul>
        {p.threads.map((t) => (
          <li key={t.id} className={t.id === p.activeId ? "active" : ""}
              onClick={() => p.onSelect(t.id)}>
            <span className={`dot ${t.provider}`} />
            {t.title}
            {t.status === "running" && <span className="spinner">⟳</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/components/Chat.tsx` :

```tsx
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AgentEvent } from "../lib/ws";

export default function Chat(p: {
  events: AgentEvent[]; disabled: boolean;
  onSubmit: (prompt: string, provider: "claude" | "codex") => void;
}) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  return (
    <div className="chat">
      <div className="messages">
        {p.events.map((e, i) => {
          if (e.kind === "text") return <div key={i} className="msg"><ReactMarkdown>{e.text}</ReactMarkdown></div>;
          if (e.kind === "tool") return <div key={i} className="tool">🔧 {e.name}</div>;
          if (e.kind === "error") return <div key={i} className="error">⚠ {e.message}</div>;
          return <div key={i} className="done">{e.ok ? "✓ terminé" : "✗ échec"}</div>;
        })}
      </div>
      <form className="input" onSubmit={(ev) => {
        ev.preventDefault();
        if (!text.trim()) return;
        p.onSubmit(text, provider); setText("");
      }}>
        <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)}
               disabled={p.disabled} placeholder="Demande quelque chose…" />
        <button disabled={p.disabled}>↑</button>
      </form>
    </div>
  );
}
```

`src/components/AtelierPane.tsx` :

```tsx
export default function AtelierPane({ url }: { url: string }) {
  return <iframe className="atelier" src={url} title="atelier" />;
}
```

`src/App.css` (remplacer le contenu) :

```css
* { box-sizing: border-box; margin: 0; }
html, body, #root, .app { height: 100vh; font-family: -apple-system, sans-serif;
  background: #1e2126; color: #e6e6e6; }
.handle { width: 4px; background: #2c313a; }
.sidebar { padding: 10px; display: flex; flex-direction: column; gap: 8px;
  height: 100%; background: #16181d; }
.sidebar button { padding: 6px; background: #2c313a; color: inherit;
  border: none; border-radius: 6px; cursor: pointer; }
.sidebar ul { list-style: none; overflow-y: auto; }
.sidebar li { padding: 6px 8px; border-radius: 6px; cursor: pointer;
  display: flex; gap: 6px; align-items: center; font-size: 13px; }
.sidebar li.active { background: #2c313a; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.claude { background: #e8825a; } .dot.codex { background: #7aa2f7; }
.spinner { margin-left: auto; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.chat { display: flex; flex-direction: column; height: 100%; }
.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex;
  flex-direction: column; gap: 10px; }
.msg { line-height: 1.5; } .tool, .done { color: #8a919e; font-size: 12px; }
.error { color: #e06c75; }
.input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2c313a; }
.input input { flex: 1; padding: 10px; background: #2c313a; border: none;
  border-radius: 8px; color: inherit; }
.input select, .input button { background: #2c313a; color: inherit;
  border: none; border-radius: 8px; padding: 0 10px; cursor: pointer; }
.atelier { width: 100%; height: 100%; border: none; background: #fff; }
```

- [ ] **Step 4: Smoke test UI**

Run: `npm run tauri dev`
Expected : « Ouvrir un projet… » → choisir `Albedo-Modis-Pipeline-Analysis` → la galerie atelier apparaît à droite ; « + Nouveau thread » → taper « liste les fichiers de scripts/viz » avec Claude → le texte streame ; ⌘⇧A masque/affiche atelier.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): layout 3 panneaux, sidebar threads, chat multi-provider, panneau atelier"
```

---

### Task 9: Validation des critères de succès du spec

**Files:**
- Create: `docs/VALIDATION_V1.md`

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Dérouler les 4 critères**

Avec `npm run tauri dev` :

1. Ouvrir un projet ⇒ atelier visible à droite en < 5 s (serveur déjà chaud) — noter le temps.
2. Lancer 2 threads en parallèle (un Claude « compte jusqu'à 5 lentement », un Codex « liste le dossier ») ⇒ les deux spinnent et streament sans se bloquer.
3. Quitter l'app, relancer ⇒ les threads réapparaissent dans la sidebar ; envoyer un message dans un ancien thread ⇒ la session reprend (le contexte précédent est connu).
4. Demander à Claude de régénérer une figure du projet ⇒ après reload du panneau atelier, la figure mise à jour apparaît.

- [ ] **Step 2: Documenter les résultats**

`docs/VALIDATION_V1.md` : un tableau critère → résultat (ok/ko + note). Tout écart = issue à corriger avant de déclarer la v1.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: validation des critères de succès v1"
```
