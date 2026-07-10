# CM6 AI Autocomplete — Perceived-Latency UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CM6 LaTeX editor's AI ghost suggestions *feel* near-instant despite the ~2.5 s warm floor of the Claude Code backend, via three client/server mechanisms: ghost survives matching keystrokes, server-side trailing coalescing, and an LRU context cache.

**Architecture:** The editor is a CodeMirror 6 prototype (`gallery/assets/cm6/latex_cm6_src.js`, bundled with esbuild to `latex_cm6.bundle.js`) served by the gallery server at `/.fig_thumbs/latex_cm6.html`. AI suggestions come from a persistent "hot" Claude Code process (`gallery/server/claude_warm.mjs`, haiku, stream-json) behind the `POST /latex-suggest` endpoint in `gallery/server/routes/editors.mjs`. This plan (a) auto-advances the ghost inside the CM6 `StateField` when typed characters match the suggestion, (b) replaces the server's busy-drop with a latest-wins waiting slot, (c) caches context→suggestion client-side.

**Tech Stack:** CodeMirror 6 (StateField/StateEffect/Decoration), Node ≥ 22 (`node --test` for unit tests), esbuild (bundle), Claude Code CLI 2.1.x (haiku, stream-json), Tauri (final app build).

## Global Constraints

- **NEVER run `pkill -f "stream-json"` or any broad pattern kill.** The user's own Claude session runs with `--input-format stream-json`. To kill the app use ONLY the path-scoped pattern: `pkill -f "Atelier.app/Contents"`. To check for a leftover warm test process use ONLY: `pgrep -fl "inline LaTeX-prose autocomplete"`.
- **Claude Max auth must be preserved:** never add `--bare` to the claude CLI args (it forces API-key auth and breaks the Max subscription), never let `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` reach the claude subprocess (claude_warm.mjs already deletes them — keep that).
- **Latency reality (measured 2026-07-07, claude 2.1.202):** warm turn ≈ 2.4–2.9 s, cold boot ≈ 3.7–4.2 s. This plan improves *perceived* latency only; do not attempt to lower the model floor (no model change, no `--bare`, no API-key route).
- **Tauri build exit code 1 is EXPECTED** — only `bundle_dmg.sh` (DMG packaging) fails; the `.app` builds and signs fine. Treat as success if `grep -iE "error" build.log | grep -viE "dmg|bundle_dmg"` is empty.
- Repo root: `/Users/tofunori/Documents/atelier-studio`, branch `main`. All paths below are relative to it unless absolute.
- The CM6 bundle is NOT built by the repo's vite/tsc pipeline; it is rebuilt with the standalone esbuild command given in Task 5. Client-source tasks (2, 3) are validated by unit tests + esbuild parse check; in-browser verification happens once, in Task 5.
- Validation protocol before shipping (Task 5, in this order): `npx tsc --noEmit` → `npx vite build` → `cd sidecar && npx vitest run` (45 tests) → `node gallery/server/tests/parity.mjs` → kill app (path-scoped) → `npm run tauri build` → relaunch → curl the embedded endpoint.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `gallery/assets/cm6/ghost_logic.mjs` | **create** | Pure, dependency-free helpers: `advanceGhost`, `LruCache`. Unit-testable with plain node. |
| `gallery/assets/cm6/latex_cm6_src.js` | modify | CM6 editor: ghost field auto-advance, AI cache, superseded handling. |
| `gallery/assets/cm6/latex_cm6.bundle.js` | regenerate | esbuild artifact (Task 5 only). |
| `gallery/server/claude_warm.mjs` | modify | Hot Claude process: replace busy-drop with trailing waiting slot. |
| `gallery/server/routes/editors.mjs` | modify | `/latex-suggest`: pass `superseded` through to the client. |
| `gallery/server/tests/ghost_logic.test.mjs` | **create** | node:test unit tests for the pure helpers. |
| `gallery/server/tests/claude_warm.test.mjs` | **create** | node:test tests for coalescing, using a fake claude binary. |
| `gallery/server/tests/fake_claude.mjs` | **create** | Stub executable that speaks just enough stream-json for the tests. |

---

### Task 0: Commit the current working state as baseline

The repo has uncommitted work from today (the warm-process backend and the CM6 prototype). Commit it first so every later task produces a clean, reviewable diff.

**Files:**
- Commit (already exist, untracked/modified): `gallery/server/claude_warm.mjs`, `gallery/server/routes/editors.mjs`, `gallery/assets/cm6/latex_cm6_src.js`, `gallery/assets/cm6/latex_cm6.bundle.js`, `gallery/assets/latex_cm6.html`

- [ ] **Step 1: Verify the baseline is green**

Run:
```bash
cd /Users/tofunori/Documents/atelier-studio
npx tsc --noEmit && npx vite build >/dev/null 2>&1 && echo TSC_VITE_OK
(cd sidecar && npx vitest run 2>&1 | tail -2)
node gallery/server/tests/parity.mjs
```
Expected: `TSC_VITE_OK`, `Tests  45 passed (45)`, `parity: ok`.

- [ ] **Step 2: Commit baseline**

```bash
cd /Users/tofunori/Documents/atelier-studio
git add gallery/server/claude_warm.mjs gallery/server/routes/editors.mjs \
        gallery/assets/cm6/ gallery/assets/latex_cm6.html
git status --short   # confirm nothing unexpected is staged (do NOT add .fig_thumbs/*)
git commit -m "feat(cm6): AI ghost autocomplete via persistent warm Claude process (haiku)"
```

---

### Task 1: Pure helpers — `advanceGhost` + `LruCache`

**Files:**
- Create: `gallery/assets/cm6/ghost_logic.mjs`
- Test: `gallery/server/tests/ghost_logic.test.mjs`

**Interfaces:**
- Consumes: nothing (dependency-free on purpose — keeps it testable without CodeMirror).
- Produces:
  - `advanceGhost(ghostText: string, inserted: string) -> string | null` — returns the remaining ghost text after the user typed `inserted` at the ghost anchor (`""` means fully consumed), or `null` if `inserted` does not match the ghost prefix.
  - `class LruCache { constructor(cap?: number); get(key: string): string | undefined; set(key: string, value: string): void }` — least-recently-used cache, default capacity 50; `get` refreshes recency.

- [ ] **Step 1: Write the failing tests**

Create `gallery/server/tests/ghost_logic.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { advanceGhost, LruCache } from "../../assets/cm6/ghost_logic.mjs";

test("advanceGhost: matching single char shrinks the ghost", () => {
  assert.equal(advanceGhost(" we conclude that", " "), "we conclude that");
  assert.equal(advanceGhost("we conclude", "w"), "e conclude");
});

test("advanceGhost: matching multi-char insert (fast typing, paste)", () => {
  assert.equal(advanceGhost("we conclude", "we conc"), "lude");
});

test("advanceGhost: full consumption returns empty string, not null", () => {
  assert.equal(advanceGhost("we", "we"), "");
});

test("advanceGhost: mismatch returns null", () => {
  assert.equal(advanceGhost("we conclude", "x"), null);
  assert.equal(advanceGhost("we conclude", "wf"), null);
});

test("advanceGhost: empty inputs return null", () => {
  assert.equal(advanceGhost("", "w"), null);
  assert.equal(advanceGhost("we", ""), null);
  assert.equal(advanceGhost(null, "w"), null);
});

test("LruCache: get/set round-trip and miss", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("zz"), undefined);
});

test("LruCache: evicts least-recently-used beyond capacity", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.get("a");          // refresh a -> b is now LRU
  c.set("c", "3");     // evicts b
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), "3");
});

test("LruCache: setting an existing key refreshes it", () => {
  const c = new LruCache(2);
  c.set("a", "1");
  c.set("b", "2");
  c.set("a", "9");     // refresh a -> b is LRU
  c.set("c", "3");     // evicts b
  assert.equal(c.get("a"), "9");
  assert.equal(c.get("b"), undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tofunori/Documents/atelier-studio && node --test gallery/server/tests/ghost_logic.test.mjs`
Expected: FAIL — `Cannot find module .../gallery/assets/cm6/ghost_logic.mjs`

- [ ] **Step 3: Write the implementation**

Create `gallery/assets/cm6/ghost_logic.mjs`:

```js
// Pure helpers for the CM6 ghost-suggestion UX. Deliberately free of
// CodeMirror imports so the logic is unit-testable with plain `node --test`
// (the CM6 bundle build copies this file next to latex_cm6_src.js).

/**
 * The user typed `inserted` exactly at the ghost anchor. If it matches the
 * start of the ghost text, return what remains of the ghost ("" when fully
 * consumed). Return null when it does not match (ghost must be recomputed).
 */
export function advanceGhost(ghostText, inserted) {
  if (!ghostText || !inserted) return null;
  if (!ghostText.startsWith(inserted)) return null;
  return ghostText.slice(inserted.length);
}

/** Tiny least-recently-used cache for context -> suggestion strings. */
export class LruCache {
  constructor(cap = 50) {
    this.cap = cap;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value); // Map iteration order = insertion order -> refresh
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test gallery/server/tests/ghost_logic.test.mjs`
Expected: `# pass 8`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add gallery/assets/cm6/ghost_logic.mjs gallery/server/tests/ghost_logic.test.mjs
git commit -m "feat(cm6): pure ghost-advance and LRU cache helpers with tests"
```

---

### Task 2: Ghost survives matching keystrokes (auto-advance in the StateField)

Today every keystroke wipes the ghost and re-requests (2.5 s wait each time). After this task, typing characters that match the displayed suggestion *advances* the ghost instead — the Copilot trick. The advance happens inside `ghostField.update`, transactionally, so rapid typing cannot race it.

**Files:**
- Modify: `gallery/assets/cm6/latex_cm6_src.js`

**Interfaces:**
- Consumes: `advanceGhost(ghostText, inserted)` from `./ghost_logic.mjs` (Task 1).
- Produces (internal to this file, used by Task 3's code):
  - `ghostValue(pos, text, source) -> {pos, text, source, deco}` — builds a ghost field value with its decoration.
  - The update-listener "kept" branch: when a doc change leaves a non-empty ghost in the field, no new AI request is scheduled.

- [ ] **Step 1: Add the import**

In `gallery/assets/cm6/latex_cm6_src.js`, after line 5 (`import {basicSetup} from "codemirror";`), add:

```js
import {advanceGhost, LruCache} from "./ghost_logic.mjs";
```

(`LruCache` is used in Task 3; importing both now avoids touching this line twice.)

- [ ] **Step 2: Refactor the ghost field with a value builder and auto-advance**

Replace the entire `setGhost` / `ghostField` block (currently):

```js
const setGhost = StateEffect.define();
const ghostField = StateField.define({
  create() {
    return {pos: 0, text: "", source: "", deco: Decoration.none};
  },
  update(value, tr) {
    value = {...value, pos: tr.changes.mapPos(value.pos), deco: value.deco.map(tr.changes)};
    for (const effect of tr.effects) {
      if (effect.is(setGhost)) {
        const next = effect.value || {pos: 0, text: ""};
        const deco = next.text
          ? Decoration.set([Decoration.widget({widget: new GhostWidget(next.text, next.source), side: 1}).range(next.pos)])
          : Decoration.none;
        value = {pos: next.pos, text: next.text || "", source: next.source || "", deco};
      }
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.deco)
});
```

with:

```js
const setGhost = StateEffect.define();

function ghostValue(pos, text, source) {
  const deco = text
    ? Decoration.set([Decoration.widget({widget: new GhostWidget(text, source), side: 1}).range(pos)])
    : Decoration.none;
  return {pos, text: text || "", source: source || "", deco};
}

// If the transaction is a single plain insertion exactly at the ghost anchor
// and the inserted text matches the ghost prefix, advance the ghost instead of
// dropping it. Returns the new field value, or null when the ghost cannot
// survive this change.
function advancedGhostValue(value, changes) {
  let single = null;
  let count = 0;
  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    count += 1;
    single = {fromA, toA, text: inserted.toString()};
  });
  if (count !== 1 || !single || single.fromA !== single.toA) return null; // not a plain insertion
  if (single.fromA !== value.pos) return null;                            // typed elsewhere
  const rest = advanceGhost(value.text, single.text);
  if (rest === null) return null;                                         // mismatch
  return ghostValue(value.pos + single.text.length, rest, value.source);
}

const ghostField = StateField.define({
  create() {
    return ghostValue(0, "", "");
  },
  update(value, tr) {
    if (tr.docChanged && value.text) {
      const advanced = advancedGhostValue(value, tr.changes);
      value = advanced || ghostValue(tr.changes.mapPos(value.pos), "", "");
    } else if (tr.docChanged) {
      value = {...value, pos: tr.changes.mapPos(value.pos), deco: value.deco.map(tr.changes)};
    }
    for (const effect of tr.effects) {
      if (effect.is(setGhost)) {
        const next = effect.value || {pos: 0, text: ""};
        value = ghostValue(next.pos, next.text, next.source);
      }
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.deco)
});
```

- [ ] **Step 3: Teach the update listener to keep a surviving ghost**

Replace, inside `mountEditor`'s `EditorView.updateListener.of(...)` (currently):

```js
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            dirty = true;
            setState(canSave ? "modified" : "demo edited");
          }
          if (update.docChanged || update.selectionSet) refreshGhost(update.view);
        }),
```

with:

```js
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            dirty = true;
            setState(canSave ? "modified" : "demo edited");
          }
          if (update.docChanged) {
            const kept = update.state.field(ghostField, false);
            if (kept && kept.text) {
              // The ghost auto-advanced in the field (user typed its prefix):
              // keep it, cancel any pending AI request, skip recomputation.
              cancelAiGhost();
              setState(kept.source === "ai"
                ? (canSave ? "AI ready" : "demo AI ready")
                : (canSave ? "local ready" : "demo local ready"));
            } else {
              refreshGhost(update.view);
            }
          } else if (update.selectionSet) {
            refreshGhost(update.view);
          }
        }),
```

Note: when the ghost is fully consumed by typing (`advanceGhost` returned `""`), the field value has `text: ""`, so this falls into `refreshGhost` — which schedules a fresh AI request for the *continuation*. That is the desired behavior.

- [ ] **Step 4: Syntax-check the modified source**

Run:
```bash
cd /Users/tofunori/Documents/atelier-studio
npx esbuild gallery/assets/cm6/latex_cm6_src.js --outfile=/dev/null && echo PARSE_OK
node --test gallery/server/tests/ghost_logic.test.mjs 2>&1 | tail -2
```
Expected: `PARSE_OK` (esbuild parse without bundling — import resolution is NOT checked here, that happens in Task 5), tests still `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add gallery/assets/cm6/latex_cm6_src.js
git commit -m "feat(cm6): ghost suggestion survives matching keystrokes (auto-advance)"
```

---

### Task 3: Client-side LRU context cache

Backspace-then-retype, or returning to a previously seen context, currently costs a fresh 2.5 s turn. Cache `context -> suggestion` so those are instant. The cache key is the exact payload sent to the server (so a hit is always contextually valid).

**Files:**
- Modify: `gallery/assets/cm6/latex_cm6_src.js`

**Interfaces:**
- Consumes: `LruCache` from `./ghost_logic.mjs` (imported in Task 2), `ghostValue`-based `setGhost` dispatch (unchanged effect API).
- Produces: module-level `aiCache` (`LruCache(50)`); cached entries are the *normalized* suggestion text WITHOUT the leading space (the leading space is re-added per-context, mirroring the fetch path).

- [ ] **Step 1: Add the cache instance**

After the module-level declarations (right after line `let aiSeq = 0;`), add:

```js
const aiCache = new LruCache(50);

function aiCacheKey(ctx) {
  return ctx.before + " " + ctx.after;
}
```

- [ ] **Step 2: Serve cache hits instantly and populate on success**

Replace the whole `scheduleAiGhost` function (currently):

```js
function scheduleAiGhost(v, ctx) {
  clearTimeout(aiTimer);
  const seq = ++aiSeq;
  aiTimer = setTimeout(async () => {
    if (!aiEnabled || !view || view !== v) return;
    const live = aiContext(v.state);
    if (!live || live.key !== ctx.key) return;
    if (aiController) aiController.abort();
    aiController = new AbortController();
    setState(canSave ? "AI..." : "demo AI...");
    try {
      const r = await fetch("/latex-suggest", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({before: ctx.before, after: ctx.after, model: "sonnet"}),
        signal: aiController.signal
      });
      const j = await r.json();
      if (seq !== aiSeq || !view || view !== v) return;
      const now = aiContext(v.state);
      if (!now || now.key !== ctx.key || ghostFor(v.state)) return;
      let text = normalizeAiText(j.text);
      if (text && ctx.needsLeadingSpace) text = " " + text;
      if (j.ok && text) {
        v.dispatch({effects: setGhost.of({pos: ctx.pos, text, source: "ai"})});
        setState(canSave ? "AI ready" : "demo AI ready");
      } else if (!j.ok && j.error) {
        const fallback = ghostFor(v.state);
        if (fallback) {
          v.dispatch({effects: setGhost.of(fallback)});
          setState(canSave ? "local ready" : "demo local ready");
        } else {
          setState(canSave ? "AI slow" : "demo AI slow");
        }
      } else if (!dirty) {
        setState(canSave ? "CM6 ready" : "demo");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setState("AI unavailable", "err");
    }
  }, 350);
}
```

with:

```js
function scheduleAiGhost(v, ctx) {
  clearTimeout(aiTimer);
  const seq = ++aiSeq;

  // Instant path: this exact context was completed before (backspace/retype,
  // revisited spot). No debounce, no network.
  const cached = aiCache.get(aiCacheKey(ctx));
  if (cached) {
    const text = ctx.needsLeadingSpace ? " " + cached : cached;
    v.dispatch({effects: setGhost.of({pos: ctx.pos, text, source: "ai"})});
    setState(canSave ? "AI ready" : "demo AI ready");
    return;
  }

  aiTimer = setTimeout(async () => {
    if (!aiEnabled || !view || view !== v) return;
    const live = aiContext(v.state);
    if (!live || live.key !== ctx.key) return;
    if (aiController) aiController.abort();
    aiController = new AbortController();
    setState(canSave ? "AI..." : "demo AI...");
    try {
      const r = await fetch("/latex-suggest", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({before: ctx.before, after: ctx.after}),
        signal: aiController.signal
      });
      const j = await r.json();
      if (seq !== aiSeq || !view || view !== v) return;
      if (j.superseded) return; // a newer request replaced this one server-side
      const now = aiContext(v.state);
      if (!now || now.key !== ctx.key || ghostFor(v.state)) return;
      const bare = normalizeAiText(j.text);
      const text = bare && ctx.needsLeadingSpace ? " " + bare : bare;
      if (j.ok && text) {
        aiCache.set(aiCacheKey(ctx), bare);
        v.dispatch({effects: setGhost.of({pos: ctx.pos, text, source: "ai"})});
        setState(canSave ? "AI ready" : "demo AI ready");
      } else if (!j.ok && j.error) {
        const fallback = ghostFor(v.state);
        if (fallback) {
          v.dispatch({effects: setGhost.of(fallback)});
          setState(canSave ? "local ready" : "demo local ready");
        } else {
          setState(canSave ? "AI slow" : "demo AI slow");
        }
      } else if (!dirty) {
        setState(canSave ? "CM6 ready" : "demo");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setState("AI unavailable", "err");
    }
  }, 350);
}
```

Changes vs the original, for the reviewer: (1) cache lookup before the debounce, (2) cache write on success (`bare`, without leading space), (3) dropped the misleading `model: "sonnet"` field (the server pins haiku and ignores it), (4) `j.superseded` handled as a silent no-op (server side lands in Task 4 — until then the field is simply absent, which is safe).

- [ ] **Step 3: Syntax-check**

Run:
```bash
npx esbuild gallery/assets/cm6/latex_cm6_src.js --outfile=/dev/null && echo PARSE_OK
```
Expected: `PARSE_OK`

- [ ] **Step 4: Commit**

```bash
git add gallery/assets/cm6/latex_cm6_src.js
git commit -m "feat(cm6): LRU cache for AI suggestions; handle superseded responses"
```

---

### Task 4: Server-side trailing coalescing (latest-wins waiting slot)

Today, a request arriving while a Claude turn is in flight is *dropped* (`busy: true`) — pause typing at the wrong moment and you get nothing. Replace the drop with a single waiting slot: the newest request waits and runs as soon as the current turn settles; any older waiter is resolved as `superseded`.

**Files:**
- Modify: `gallery/server/claude_warm.mjs`
- Modify: `gallery/server/routes/editors.mjs` (the `/latex-suggest` handler, currently at lines ~652-685)
- Create: `gallery/server/tests/fake_claude.mjs`
- Test: `gallery/server/tests/claude_warm.test.mjs`

**Interfaces:**
- Consumes: existing exports of `claude_warm.mjs` (`warmSuggest`, `prewarm`, `stopWarm`) — signatures unchanged.
- Produces: `warmSuggest(...) -> Promise<{text: string, busy?: false, timeout?: true, superseded?: true}>`. `busy: true` is no longer returned in normal operation; `superseded: true` means a newer request replaced this one while it waited. The HTTP endpoint mirrors `superseded` in its JSON (`{ok:false, text:"", superseded:true, source:"claude-warm"}`).

- [ ] **Step 1: Create the fake claude binary for tests**

Create `gallery/server/tests/fake_claude.mjs`:

```js
#!/usr/bin/env node
// Minimal stand-in for the Claude Code CLI in stream-json mode, for tests.
// Ignores argv. For each JSON line on stdin, replies ~150 ms later with a
// stream-json result line: {"type":"result","subtype":"success","result":"echo:<n>"}.
let n = 0;
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    n += 1;
    const i = n;
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: `echo:${i}` }) + "\n");
    }, 150);
  }
});
```

Make it executable: `chmod +x gallery/server/tests/fake_claude.mjs`

- [ ] **Step 2: Write the failing tests**

Create `gallery/server/tests/claude_warm.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { warmSuggest, stopWarm } from "../claude_warm.mjs";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake_claude.mjs");
const ENV = { ...process.env };
const CWD = process.cwd();

test("single request round-trips through the hot process", async () => {
  const r = await warmSuggest(FAKE, CWD, ENV, { before: "Hello ", after: "" });
  assert.equal(r.text, "echo:1");
  stopWarm();
});

test("request arriving mid-turn waits and runs next (trailing)", async () => {
  const p1 = warmSuggest(FAKE, CWD, ENV, { before: "one ", after: "" });
  const p2 = warmSuggest(FAKE, CWD, ENV, { before: "two ", after: "" });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.text, "echo:1");
  assert.equal(r2.text, "echo:2");          // ran after r1 settled, not dropped
  assert.ok(!r2.busy);
  stopWarm();
});

test("newest waiter wins; older waiter resolves superseded", async () => {
  const p1 = warmSuggest(FAKE, CWD, ENV, { before: "one ", after: "" });
  const p2 = warmSuggest(FAKE, CWD, ENV, { before: "two ", after: "" });
  const p3 = warmSuggest(FAKE, CWD, ENV, { before: "three ", after: "" });
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1.text, "echo:1");
  assert.equal(r2.superseded, true);        // replaced by p3 while waiting
  assert.equal(r2.text, "");
  assert.equal(r3.text, "echo:2");          // the trailing turn
  stopWarm();
});
```

- [ ] **Step 3: Run tests to verify current behavior fails them**

Run: `node --test gallery/server/tests/claude_warm.test.mjs`
Expected: test 1 PASSES (round-trip already works); tests 2 and 3 FAIL — currently the second concurrent call returns `{text:"", busy:true}` immediately, so `r2.text`/`r3.text` assertions fail.

- [ ] **Step 4: Implement the waiting slot in `claude_warm.mjs`**

Replace, in `gallery/server/claude_warm.mjs`, the section from `let pending = null;` (in the "process state" block) through the end of the `warmSuggest` function, i.e. replace:

```js
let pending = null; // { resolve, timer } for the single in-flight turn
```

with:

```js
let pending = null; // { resolve, timer } for the single in-flight turn
let waiting = null; // { payload, resolve } — newest request queued behind the turn
```

then replace the whole `warmSuggest` function (currently):

```js
/**
 * Request one completion from the hot process.
 * Returns { text, busy } — busy=true means a turn is already in flight and the
 * caller should keep its local ghost (single-flight, no backlog).
 */
export async function warmSuggest(claudeBin, cwd, env, payload) {
  bootConf = { claudeBin, cwd, env };
  if (pending) return { text: "", busy: true };
  ensureAlive();
  if (!proc) return { text: "", busy: false };

  turns += 1;
  const message = turnMessage(payload);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Turn stalled: kill the process so a half-done turn can't queue behind
      // the next request. Next call re-boots clean.
      pending = null;
      resolve({ text: "", busy: false, timeout: true });
      killProc();
    }, TURN_TIMEOUT_MS);
    pending = { resolve: (text) => resolve({ text, busy: false }), timer };
    try {
      proc.stdin.write(JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: message }] },
      }) + "\n");
    } catch {
      settlePending("");
      killProc();
    }
  });
}
```

with:

```js
function drainWaiting() {
  if (!waiting || pending) return;
  const next = waiting;
  waiting = null;
  startTurn(next.payload, next.resolve);
}

function startTurn(payload, resolve) {
  ensureAlive();
  if (!proc) {
    resolve({ text: "", busy: false });
    return;
  }
  turns += 1;
  const message = turnMessage(payload);
  const timer = setTimeout(() => {
    // Turn stalled: kill the process so a half-done turn can't corrupt the
    // next one. The waiting request (if any) re-boots a clean process.
    pending = null;
    resolve({ text: "", busy: false, timeout: true });
    killProc();
    drainWaiting();
  }, TURN_TIMEOUT_MS);
  pending = {
    resolve: (text) => {
      resolve({ text, busy: false });
      drainWaiting();
    },
    timer,
  };
  try {
    proc.stdin.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: message }] },
    }) + "\n");
  } catch {
    settlePending("");
    killProc();
  }
}

/**
 * Request one completion from the hot process (single-flight + trailing slot).
 * If a turn is in flight, the request waits in a one-deep slot and runs as
 * soon as the turn settles; a newer request replaces an older waiter, which
 * resolves with { superseded: true }.
 */
export async function warmSuggest(claudeBin, cwd, env, payload) {
  bootConf = { claudeBin, cwd, env };
  return new Promise((resolve) => {
    if (pending) {
      if (waiting) waiting.resolve({ text: "", busy: false, superseded: true });
      waiting = { payload, resolve };
      return;
    }
    startTurn(payload, resolve);
  });
}
```

and replace `stopWarm` (currently):

```js
/** Cleanly stop the hot process (tests / shutdown). */
export function stopWarm() {
  settlePending("");
  killProc();
}
```

with:

```js
/** Cleanly stop the hot process (tests / shutdown). */
export function stopWarm() {
  if (waiting) {
    waiting.resolve({ text: "", busy: false, superseded: true });
    waiting = null;
  }
  settlePending("");
  killProc();
}
```

Sequencing note for the implementer: `settlePending` sets `pending = null` *before* calling the stored resolve, so the `drainWaiting()` inside the wrapped resolve sees `pending === null` and starts the waiting turn immediately. In `stopWarm`, the waiting slot is flushed *before* `settlePending` so `drainWaiting` cannot restart a turn during shutdown.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test gallery/server/tests/claude_warm.test.mjs`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 6: Pass `superseded` through the HTTP endpoint**

In `gallery/server/routes/editors.mjs`, in the `/latex-suggest` handler, replace:

```js
      const r = await warmSuggest(claude, PROJECT, claudeSuggestEnv(), { before, after });
      if (r.busy) return sendJson(res, 200, { ok: false, text: "", busy: true, source: "claude-warm" });
      if (r.timeout) return sendJson(res, 200, { ok: false, text: "", error: "claude timeout", source: "claude-warm" });
```

with:

```js
      const r = await warmSuggest(claude, PROJECT, claudeSuggestEnv(), { before, after });
      if (r.superseded) return sendJson(res, 200, { ok: false, text: "", superseded: true, source: "claude-warm" });
      if (r.timeout) return sendJson(res, 200, { ok: false, text: "", error: "claude timeout", source: "claude-warm" });
```

(The `busy` branch is removed: with the waiting slot, `busy: true` is no longer produced.)

- [ ] **Step 7: Run the full server-side test battery**

Run:
```bash
cd /Users/tofunori/Documents/atelier-studio
node --test gallery/server/tests/ghost_logic.test.mjs gallery/server/tests/claude_warm.test.mjs 2>&1 | tail -3
node gallery/server/tests/parity.mjs
```
Expected: `# pass 11` / `# fail 0`, and `parity: ok`

- [ ] **Step 8: Commit**

```bash
git add gallery/server/claude_warm.mjs gallery/server/routes/editors.mjs \
        gallery/server/tests/fake_claude.mjs gallery/server/tests/claude_warm.test.mjs
git commit -m "feat(gallery): trailing coalescing for /latex-suggest (latest-wins waiting slot)"
```

---

### Task 5: Rebundle, validate, build the app, verify live

**Files:**
- Regenerate: `gallery/assets/cm6/latex_cm6.bundle.js`

**Interfaces:**
- Consumes: everything above. The bundle build copies `latex_cm6_src.js` AND `ghost_logic.mjs` into a temp dir (the source imports `./ghost_logic.mjs` relatively).
- Produces: the shipped app.

- [ ] **Step 1: Rebuild the CM6 bundle**

This is the exact known-good recipe (the repo's node_modules does NOT contain CodeMirror; the bundle is built in a throwaway dir):

```bash
rm -rf /tmp/atelier-cm6-build && mkdir -p /tmp/atelier-cm6-build
cp /Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/latex_cm6_src.js \
   /Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/ghost_logic.mjs \
   /tmp/atelier-cm6-build/
cd /tmp/atelier-cm6-build
npm init -y >/dev/null
npm install esbuild codemirror @codemirror/autocomplete @codemirror/state @codemirror/view @codemirror/commands >/dev/null
./node_modules/.bin/esbuild latex_cm6_src.js --bundle --format=iife --global-name=AtelierLatexCM6 \
  --outfile=/Users/tofunori/Documents/atelier-studio/gallery/assets/cm6/latex_cm6.bundle.js --minify
cd /Users/tofunori/Documents/atelier-studio && rm -rf /tmp/atelier-cm6-build
```
Expected: esbuild reports the output file (~390-400 KB), zero errors.

- [ ] **Step 2: Smoke-test against a temporary source server**

```bash
cd /Users/tofunori/Documents/atelier-studio
FIG_PORT=19601 GALLERY_ROOT="$PWD" node gallery/server/main.mjs >/tmp/cm6_smoke.log 2>&1 &
sleep 2
# endpoint answers through the warm process
curl -s -m 30 -X POST http://127.0.0.1:19601/latex-suggest -H 'content-type: application/json' \
  -d '{"before":"The experiment shows that ","after":""}'
echo
# trailing coalescing over HTTP: fire two, both should answer (2nd NOT busy-dropped)
curl -s -m 30 -X POST http://127.0.0.1:19601/latex-suggest -H 'content-type: application/json' -d '{"before":"In conclusion ","after":""}' &
sleep 0.2
curl -s -m 30 -X POST http://127.0.0.1:19601/latex-suggest -H 'content-type: application/json' -d '{"before":"The glacier ","after":""}'
wait
# cleanup: the source server AND the warm claude it spawned
kill %1 2>/dev/null
pgrep -fl "inline LaTeX-prose autocomplete" && pkill -f "inline LaTeX-prose autocomplete" || true
```
Expected: first call returns `{"ok": true, "text": "...", "source": "claude-warm", "model": "haiku"}` (~4 s cold). The two concurrent calls BOTH return `ok: true` text (the second waits for the slot — total ~5 s), none returns `busy`.

- [ ] **Step 3: Full repo validation protocol**

```bash
cd /Users/tofunori/Documents/atelier-studio
npx tsc --noEmit && echo TSC_OK
npx vite build >/dev/null 2>&1 && echo VITE_OK
(cd sidecar && npx vitest run 2>&1 | tail -2)
node gallery/server/tests/parity.mjs
node --test gallery/server/tests/ghost_logic.test.mjs gallery/server/tests/claude_warm.test.mjs 2>&1 | tail -3
```
Expected: `TSC_OK`, `VITE_OK`, `Tests  45 passed (45)`, `parity: ok`, `# pass 11` / `# fail 0`.

- [ ] **Step 4: Kill the running app (path-scoped ONLY) and build**

```bash
pkill -f "Atelier.app/Contents" 2>/dev/null || true
sleep 1
pgrep -fl "Atelier.app/Contents" || echo "atelier down"
cd /Users/tofunori/Documents/atelier-studio
npm run tauri build >/tmp/atelier_build.log 2>&1; echo "exit=$?"
grep -iE "error" /tmp/atelier_build.log | grep -viE "dmg|bundle_dmg" || echo "no non-DMG errors"
ls -la src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app
```
Expected: `exit=1` (DMG-only failure — see Global Constraints), `no non-DMG errors`, and the `tauri-app` binary freshly timestamped.

- [ ] **Step 5: Relaunch and verify the embedded server runs the new code**

```bash
open /Users/tofunori/Documents/atelier-studio/src-tauri/target/release/bundle/macos/Atelier.app
sleep 6
pgrep -f "Atelier.app/Contents/MacOS/tauri-app" >/dev/null && echo "app up"
# embedded gallery server listens on 19175
curl -s -m 30 -X POST http://127.0.0.1:19175/latex-suggest -H 'content-type: application/json' \
  -d '{"before":"Measurements indicate that ","after":""}'
```
Expected: `app up`, then `{"ok": true, ..., "source": "claude-warm", "model": "haiku"}`.

- [ ] **Step 6: Commit the bundle**

```bash
git add gallery/assets/cm6/latex_cm6.bundle.js
git commit -m "build(cm6): rebundle with ghost auto-advance, AI cache, coalescing client"
```

- [ ] **Step 7: Hand the user a manual test script**

Tell the user to reload the CM6 page (`Cmd+R` on `http://127.0.0.1:19175/.fig_thumbs/latex_cm6.html?path=...`) and check, in order:
1. **Auto-advance:** type `The results ` → wait for the grey AI ghost → type the first 2-3 characters OF the ghost text → the ghost must shrink in place, instantly, without flashing or a new "AI..." status.
2. **Cache:** accept nothing; press Backspace over those characters, retype them → the ghost must reappear instantly ("AI ready" with no "AI..." phase).
3. **Coalescing:** type a phrase, pause mid-word for ~half a second, continue, then stop → a suggestion must still arrive after the final pause (previously the mid-typing request could eat the slot and the final pause got nothing).

---

## Self-Review Notes

- **Spec coverage:** feature 1 (ghost survives typing) → Task 2; feature 2 (trailing coalescing) → Task 4; feature 3 (prefix cache) → Task 3; deployment → Task 5. Baseline commit → Task 0.
- **Known limitation (accepted):** in Task 2, an insertion produced by anything other than plain typing (paste that happens to match, autocomplete apply) also advances the ghost — semantically harmless. Multi-change transactions and deletions clear the ghost and recompute, which is the safe default.
- **Type consistency:** `advanceGhost` returns `"" | string | null` — Task 2's field code distinguishes `null` (mismatch → clear) from `""` (consumed → clear + `refreshGhost` requests continuation) via the `advanced || ghostValue(..., "", "")` fallback; both produce `text: ""` in the field, and the listener's `refreshGhost` branch handles both. `warmSuggest` result shape `{text, busy?, timeout?, superseded?}` is used consistently in Task 4's endpoint code and Task 3's client (`j.superseded`).
- **No placeholders:** every step carries complete code or an exact command with expected output.
