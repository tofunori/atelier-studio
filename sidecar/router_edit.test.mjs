import { describe, it, expect } from "vitest";
import { __enrichEditEventForTest as enrichEditEvent } from "./router.mjs";

// Diff immédiat : les snippets provider (clé = chemin ORIGINAL de event.files)
// doivent survivre à la reconstruction/relativisation d'enrichEditEvent.
describe("enrichEditEvent — snippets du diff immédiat", () => {
  const ctx = { gitops: { numstat: async () => ({ add: 3, del: 1 }) } };
  const turn = { projectRoot: "/p", snapshotSha: "abc" };

  it("porte oldText/newText du snippet sur l'entrée fichier relativisée", async () => {
    const out = await enrichEditEvent(ctx, turn, {
      kind: "edit",
      files: ["/p/src/a.py"],
      snippets: { "/p/src/a.py": { oldText: "x = 1", newText: "x = 2" } },
    });
    expect(out.files).toEqual([{ path: "src/a.py", add: 3, del: 1, oldText: "x = 1", newText: "x = 2" }]);
    expect(out.snippets).toBeUndefined(); // jamais exposé tel quel au front
    expect(out.baseSha).toBe("abc");
  });

  it("sans snippet (codex/grok) : entrées {path,add,del} inchangées", async () => {
    const out = await enrichEditEvent(ctx, turn, { kind: "edit", files: ["/p/b.md"] });
    expect(out.files).toEqual([{ path: "b.md", add: 3, del: 1 }]);
  });

  it("snippet sans newText (forme inattendue) : ignoré sans crash", async () => {
    const out = await enrichEditEvent(ctx, turn, {
      kind: "edit",
      files: ["/p/c.py"],
      snippets: { "/p/c.py": { oldText: "seul" } },
    });
    expect(out.files).toEqual([{ path: "c.py", add: 3, del: 1 }]);
  });
});
