import { describe, expect, it } from "vitest";
import { deriveChangedFiles } from "./changedFiles";
import type { AgentEvent } from "../../lib/ws";

describe("deriveChangedFiles", () => {
  it("cumule les +/− par fichier et complète depuis done.filesChanged", () => {
    const turn: AgentEvent[] = [
      { kind: "edit", files: [{ path: "src/a.ts", add: 3, del: 1 }] } as AgentEvent,
      { kind: "edit", files: [{ path: "src/a.ts", add: 2, del: 0 }, { path: "src/b.ts", add: 5, del: 5 }] } as AgentEvent,
    ];
    const done = { kind: "done", ok: true, filesChanged: ["src/a.ts", "docs/c.md"] } as AgentEvent;
    const files = deriveChangedFiles(turn, done as Extract<AgentEvent, { kind: "done" }>);
    expect(files).toEqual([
      { path: "src/b.ts", name: "b.ts", add: 5, del: 5 },
      { path: "src/a.ts", name: "a.ts", add: 5, del: 1 },
      { path: "docs/c.md", name: "c.md", add: null, del: null },
    ]);
  });

  it("sans events ni done : liste vide", () => {
    expect(deriveChangedFiles([], null)).toEqual([]);
  });

  it("edits sans compte +/- (chemins nus) : add/del restent null", () => {
    const turn: AgentEvent[] = [
      { kind: "edit", files: [{ path: "src/a.ts", add: null, del: null }] } as AgentEvent,
    ];
    const done = { kind: "done", ok: true, filesChanged: ["src/a.ts", "src/b.ts"] } as AgentEvent;
    const files = deriveChangedFiles(turn, done as Extract<AgentEvent, { kind: "done" }>);
    expect(files).toEqual([
      { path: "src/a.ts", name: "a.ts", add: null, del: null },
      { path: "src/b.ts", name: "b.ts", add: null, del: null },
    ]);
  });
});
