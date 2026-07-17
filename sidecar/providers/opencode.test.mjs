import { describe, expect, it } from "vitest";
import { normalizeOpenCodeMessage, parseOpenCodeJsonl, parseOpenCodeModelsOutput } from "./opencode.mjs";

describe("opencode provider stream normalization", () => {
  it("parse le catalogue modèles et retire les doublons", () => {
    expect(parseOpenCodeModelsOutput(
      "opencode/glm-5.2\nopenrouter/z-ai/glm-5.2\nwarning ignored\nopencode/glm-5.2\n",
    )).toEqual(["opencode/glm-5.2", "openrouter/z-ai/glm-5.2"]);
  });
  it("normalizes the real headless JSONL event shapes", () => {
    const fixture = [
      '{"type":"step_start","timestamp":1783389776989,"sessionID":"ses_abc","part":{"type":"step-start"}}',
      '{"type":"text","timestamp":1783389776989,"sessionID":"ses_abc","part":{"type":"text","text":"OK"}}',
      '{"type":"step_finish","timestamp":1783389777044,"sessionID":"ses_abc","part":{"reason":"stop","type":"step-finish","tokens":{"total":56153,"input":56086,"output":1,"reasoning":2,"cache":{"write":0,"read":64}},"cost":0.05097910576}}',
      "",
    ].join("\n");
    const parsed = parseOpenCodeJsonl(fixture);
    expect(parsed.rest).toBe("");
    expect(parsed.events).toEqual([
      { kind: "started" },
      { kind: "delta", text: "OK" },
      {
        kind: "usage",
        sessionId: "ses_abc",
        usage: { context: 56086, output: 1, cost: 0.05097910576, turns: null },
      },
    ]);
  });

  it("normalizes individual event shapes", () => {
    expect(normalizeOpenCodeMessage({ type: "text", part: { text: "hi" } }))
      .toEqual([{ kind: "delta", text: "hi" }]);
    expect(normalizeOpenCodeMessage({ type: "reasoning", part: { text: "hm" } }))
      .toEqual([{ kind: "thinking_delta", text: "hm" }]);
    expect(normalizeOpenCodeMessage({
      type: "tool_use",
      part: {
        tool: "glob",
        callID: "call_1",
        state: { status: "completed", title: "README.md", input: { pattern: "README.md" }, output: "README.md" },
        metadata: { openrouter: { reasoning_details: [{ type: "reasoning.text", text: "je cherche" }] } },
      },
    })).toEqual([
      { kind: "thinking_delta", text: "je cherche" },
      {
        kind: "tool_update",
        id: "call_1",
        name: "glob",
        detail: "README.md",
        input: { pattern: "README.md" },
        output: "README.md",
        status: "completed",
        source: null,
      },
    ]);
    expect(normalizeOpenCodeMessage({ type: "error", error: { message: "boom" } }))
      .toEqual([{ kind: "error", message: "boom" }]);
    expect(normalizeOpenCodeMessage({ type: "unknown-future-event" })).toEqual([]);
  });

  it("buffers partial JSONL lines across chunks", () => {
    const first = parseOpenCodeJsonl('{"type":"text","part":{"te');
    expect(first.events).toEqual([]);
    const second = parseOpenCodeJsonl('xt":"hi"}}\n', first.rest);
    expect(second.events).toEqual([{ kind: "delta", text: "hi" }]);
    expect(second.rest).toBe("");
  });
});

import { makeTranscriptRecorder, history } from "./opencode.mjs";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("opencode transcripts", () => {
  it("persiste user+assistant une seule fois, puis relit en events UI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-oc-transcripts-"));
    const rec = makeTranscriptRecorder("ma question", { dir });
    rec.absorb({ kind: "thinking_delta", text: "hmm " });
    rec.absorb({ kind: "delta", text: "voici " });
    rec.absorb({ kind: "delta", text: "la réponse" });
    rec.absorb({ kind: "tool_update", id: "x", name: "bash", output: "ignoré" });

    expect(rec.persist("ses_123")).toBe(true);
    expect(rec.persist("ses_123")).toBe(false); // une seule écriture par tour

    const lines = readFileSync(join(dir, "ses_123.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const events = await history("ses_123", "/p", { dir });
    expect(events.map((e) => ({ kind: e.kind, text: e.text }))).toEqual([
      { kind: "user", text: "ma question" },
      { kind: "thinking", text: "hmm " },
      { kind: "text", text: "voici la réponse" },
    ]);
  });

  it("interruption : le partiel est conservé", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-oc-partiel-"));
    const rec = makeTranscriptRecorder("question interrompue", { dir });
    rec.absorb({ kind: "delta", text: "début de rép" });

    expect(rec.persist("ses_int")).toBe(true);

    const events = await history("ses_int", "/p", { dir });
    expect(events.at(-1)).toMatchObject({ kind: "text", text: "début de rép" });
  });

  it("sans sessionId stable ou sans contenu : rien n'est écrit", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-oc-rien-"));
    const vide = makeTranscriptRecorder("q", { dir });
    expect(vide.persist("ses_x")).toBe(false); // aucun texte accumulé
    const sansSid = makeTranscriptRecorder("q", { dir });
    sansSid.absorb({ kind: "delta", text: "texte" });
    expect(sansSid.persist(null)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("session inconnue → [] (les anciennes sessions ne sont pas rétro-importées)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-oc-absent-"));
    expect(await history("ses_avant_fonctionnalite", "/p", { dir })).toEqual([]);
  });
});
