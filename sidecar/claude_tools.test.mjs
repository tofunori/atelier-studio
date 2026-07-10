import { describe, it, expect, vi } from "vitest";

// Plan 025 step 6 : les outils Claude transportent le contrat tool_update
// complet (running → completed/failed, sortie bornée, edit préservé). SDK
// mocké : query() contrôlable depuis le test — mêmes patrons que
// claude_lifecycle.test.mjs.
vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  const queries = [];
  const END = Symbol("end");
  const query = (opts) => {
    const waiters = [];
    const backlog = [];
    const gen = (async function* () {
      for (;;) {
        const msg = backlog.length
          ? backlog.shift()
          : await new Promise((r) => waiters.push(r));
        if (msg === END) return;
        yield msg;
      }
    })();
    gen.setModel = async () => {};
    gen.setPermissionMode = async () => {};
    gen.interrupt = async () => {};
    const feed = (m) => {
      const w = waiters.shift();
      if (w) w(m);
      else backlog.push(m);
    };
    queries.push({ opts, feed, end: () => feed(END) });
    return gen;
  };
  return { query, getSessionMessages: async () => [], __queries: queries };
});

import * as claude from "./providers/claude.mjs";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

const flush = () => new Promise((r) => setTimeout(r, 10));

const assistantToolUse = (id, name, input) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const userToolResult = (toolUseId, content, isError = false) => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }] },
});
const resultMsg = () => ({ type: "result", subtype: "success", result: "fin", usage: {} });

async function session(name) {
  const events = [];
  claude.send({ threadId: name, cwd: "/tmp", prompt: "x", onEvent: (e) => events.push(e) });
  await flush();
  const q = sdk.__queries.at(-1);
  return {
    events,
    q,
    tools: () => events.filter((e) => e.kind === "tool_update"),
    finish: async () => {
      q.feed(resultMsg());
      q.end();
      await flush();
      claude.endSession(name);
    },
  };
}

describe("outils Claude — contrat tool_update (plan 025)", () => {
  it("Bash succès : running puis completed avec sortie et durée", async () => {
    const s = await session("ct-1");
    s.q.feed(assistantToolUse("tu-1", "Bash", { command: "git status" }));
    await flush();
    expect(s.tools()).toHaveLength(1);
    expect(s.tools()[0]).toMatchObject({ id: "tu-1", name: "Bash", status: "running", detail: "git status" });

    s.q.feed(userToolResult("tu-1", "On branch main\nnothing to commit"));
    await flush();
    const done = s.tools().at(-1);
    expect(done).toMatchObject({ id: "tu-1", status: "completed" });
    expect(done.output).toContain("nothing to commit");
    expect(typeof done.durationMs).toBe("number");
    await s.finish();
  });

  it("outil en échec : failed avec la sortie d'erreur ; PAS d'événement edit", async () => {
    const s = await session("ct-2");
    s.q.feed(assistantToolUse("tu-2", "Edit", { file_path: "/p/a.txt" }));
    s.q.feed(userToolResult("tu-2", "permission denied", true));
    await flush();
    const done = s.tools().at(-1);
    expect(done).toMatchObject({ id: "tu-2", name: "Edit", status: "failed" });
    expect(done.output).toContain("permission denied");
    expect(s.events.some((e) => e.kind === "edit")).toBe(false);
    await s.finish();
  });

  it("Edit succès : tool_update completed PUIS événement edit (les deux préservés)", async () => {
    const s = await session("ct-3");
    s.q.feed(assistantToolUse("tu-3", "Write", { file_path: "/p/nouveau.py" }));
    s.q.feed(userToolResult("tu-3", "ok"));
    await flush();
    const kinds = s.events.map((e) => e.kind);
    const done = s.tools().at(-1);
    expect(done).toMatchObject({ id: "tu-3", name: "Write", status: "completed" });
    const edit = s.events.find((e) => e.kind === "edit");
    expect(edit?.files).toEqual(["/p/nouveau.py"]);
    expect(kinds.indexOf("edit")).toBeGreaterThan(kinds.lastIndexOf("tool_update"));
    await s.finish();
  });

  it("sortie longue tronquée à 64 KiB avec longueur originale", async () => {
    const s = await session("ct-4");
    const big = "x".repeat(70 * 1024);
    s.q.feed(assistantToolUse("tu-4", "Read", { file_path: "/p/gros.csv" }));
    s.q.feed(userToolResult("tu-4", big));
    await flush();
    const done = s.tools().at(-1);
    expect(done.truncated).toBe(true);
    expect(done.output.length).toBe(64 * 1024);
    expect(done.outputLength).toBe(70 * 1024);
    await s.finish();
  });

  it("outil MCP : source mcp, nom exact conservé, contenu en blocs normalisé", async () => {
    const s = await session("ct-5");
    s.q.feed(assistantToolUse("tu-5", "mcp__gbrain__query", { q: "albédo" }));
    s.q.feed(userToolResult("tu-5", [{ type: "text", text: "résultat" }, { autre: 1 }]));
    await flush();
    const done = s.tools().at(-1);
    expect(done).toMatchObject({ name: "mcp__gbrain__query", source: "mcp", status: "completed" });
    expect(done.output).toContain("résultat");
    expect(done.output).toContain('"autre":1');
    await s.finish();
  });

  it("tool_result orphelin : item diagnostique unknown, sans crash", async () => {
    const s = await session("ct-6");
    s.q.feed(userToolResult("inconnu-9", "sortie perdue"));
    await flush();
    const done = s.tools().at(-1);
    expect(done).toMatchObject({ id: "inconnu-9", name: "unknown", source: "unknown", status: "completed" });
    await s.finish();
  });

  it("interruption : un tool_use sans résultat devient interrupted au terminal, jamais running éternel", async () => {
    const s = await session("ct-7");
    s.q.feed(assistantToolUse("tu-7", "Bash", { command: "sleep 999" }));
    await flush();
    expect(s.tools().at(-1).status).toBe("running");
    s.q.feed(resultMsg());
    await flush();
    const kinds = s.events.map((e) => e.kind);
    const last = s.tools().at(-1);
    expect(last).toMatchObject({ id: "tu-7", status: "interrupted" });
    expect(kinds.indexOf("done")).toBeGreaterThan(kinds.lastIndexOf("tool_update"));
    s.q.end();
    await flush();
    claude.endSession("ct-7");
  });

  it("input volumineux borné à 16 KiB (aperçu, jamais l'objet complet)", async () => {
    const s = await session("ct-8");
    s.q.feed(assistantToolUse("tu-8", "Write", { file_path: "/p/x", content: "y".repeat(30 * 1024) }));
    await flush();
    const running = s.tools().at(-1);
    expect(running.input.truncated).toBe(true);
    expect(running.input.preview.length).toBe(16 * 1024);
    await s.finish();
  });
});
