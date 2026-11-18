import { describe, expect, it } from "vitest";
import { parseAttachment } from "./composerAttachments";
import { cellRunState, errorFixRequest, errorLocation, formatRunDuration } from "./notebookRun";

const TB = [
  "---------------------------------------------------------------------------",
  "ZeroDivisionError                         Traceback (most recent call last)",
  "Cell In[6], line 4",
  "      1 def anomalie(a, ref):",
  "      2     return (a - ref) / ref",
  "      3 ",
  "----> 4 anomalie(1, 0)",
  "",
  "Cell In[6], line 2, in anomalie(a, ref)",
  "      1 def anomalie(a, ref):",
  "----> 2     return (a - ref) / ref",
  "",
  "ZeroDivisionError: division by zero",
].join("\n");

describe("errorLocation", () => {
  it("garde le cadre le plus profond de la cellule", () => {
    expect(errorLocation(TB, 6)).toEqual({ line: 2, code: "return (a - ref) / ref", func: "anomalie(a, ref)" });
  });
  it("ignore les cadres d'une autre cellule", () => {
    const other = TB.replace("Cell In[6], line 2", "Cell In[3], line 2");
    expect(errorLocation(other, 6)).toEqual({ line: 4, code: "anomalie(1, 0)", func: undefined });
  });
  it("rend null sans cadre de cellule", () => {
    expect(errorLocation("NameError: name 'x' is not defined", 2)).toBeNull();
  });
});

describe("cellRunState", () => {
  const cell = { id: "a", outputs: [], executionCount: 3 };
  it("terminée, en cours, en attente, avant le redémarrage", () => {
    const run = { startedAt: 1000, finishedAt: 1840, generation: 1 };
    expect(cellRunState({ cell, run, running: false, queued: false, generation: 1, now: 5000 })).toEqual({ kind: "done", durationMs: 840, finishedAt: 1840 });
    expect(cellRunState({ cell, run: { startedAt: 1000, generation: 1 }, running: true, queued: false, generation: 1, now: 13000 })).toEqual({ kind: "running", elapsedMs: 12000 });
    expect(cellRunState({ cell, running: false, queued: true, generation: 1, now: 0 }).kind).toBe("queued");
    expect(cellRunState({ cell, run, running: false, queued: false, generation: 2, now: 0 }).kind).toBe("stale");
  });
  it("erreur lue dans les sorties, même chargée du fichier", () => {
    const failed = { ...cell, outputs: [{ kind: "error" as const, ename: "E", evalue: "v", traceback: "" }] };
    expect(cellRunState({ cell: failed, running: false, queued: false, generation: 0, now: 0 })).toEqual({ kind: "error", durationMs: undefined });
  });
});

describe("formatRunDuration", () => {
  it("formate en français", () => {
    expect(formatRunDuration(840)).toBe("0,84 s");
    expect(formatRunDuration(12_400)).toBe("12 s");
    expect(formatRunDuration(125_000)).toBe("2 min 05 s");
  });
});

describe("errorFixRequest", () => {
  it("devient une capsule nommée comme les autres extraits", () => {
    const text = errorFixRequest({
      notebookName: "albedo.ipynb",
      cellIndex: 6,
      source: "def f(a):\n    return a / 0\n\nf(3)",
      error: { kind: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: TB },
    });
    const att = parseAttachment(text);
    expect(att.name).toBe("albedo.ipynb [6]");
    expect(att.lines).toBe("1-4");
    expect(text).toContain("ZeroDivisionError: division by zero");
    expect(text).toContain("Cell In[6], line 2");
  });
});
