import { describe, expect, it } from "vitest";
import { deriveChangedFiles } from "./changedFiles";
import type { AgentEvent } from "../../lib/ws";

describe("deriveChangedFiles", () => {
  // Les +/− d'un `edit` sont un numstat CONTRE HEAD : déjà le total du fichier
  // pour ce tour. Trois éditions du même fichier ne s'additionnent donc PAS —
  // la dernière valeur fait foi (sinon le compte triple).
  it("garde le dernier compte par fichier et complète depuis done.filesChanged", () => {
    const turn: AgentEvent[] = [
      { kind: "edit", files: [{ path: "src/a.ts", add: 3, del: 1 }] } as AgentEvent,
      { kind: "edit", files: [{ path: "src/a.ts", add: 12, del: 4 }, { path: "src/b.ts", add: 5, del: 5 }] } as AgentEvent,
    ];
    const done = { kind: "done", ok: true, filesChanged: ["src/a.ts", "docs/c.md"] } as AgentEvent;
    const files = deriveChangedFiles(turn, done as Extract<AgentEvent, { kind: "done" }>);
    expect(files).toEqual([
      { path: "src/a.ts", name: "a.ts", add: 12, del: 4 },
      { path: "src/b.ts", name: "b.ts", add: 5, del: 5 },
      { path: "docs/c.md", name: "c.md", add: null, del: null },
    ]);
  });

  // Un compte connu ne doit pas être effacé par une édition ultérieure qui
  // n'en porte pas (providers Rust : chemins nus).
  it("un edit sans compte n'efface pas un compte déjà connu", () => {
    const turn: AgentEvent[] = [
      { kind: "edit", files: [{ path: "src/a.ts", add: 7, del: 2 }] } as AgentEvent,
      { kind: "edit", files: [{ path: "src/a.ts", add: null, del: null }] } as AgentEvent,
    ];
    expect(deriveChangedFiles(turn, null)).toEqual([
      { path: "src/a.ts", name: "a.ts", add: 7, del: 2 },
    ]);
  });

  it("sans events ni done : liste vide", () => {
    expect(deriveChangedFiles([], null)).toEqual([]);
  });

  // Le numstat Rust du done fait autorité : contre le snapshot du tour, il
  // écrase les valeurs approximatives venues des edits, et couvre les chemins
  // que les providers n'ont jamais chiffrés (2026-08-22).
  it("done.fileStats remplit et corrige les ± de tous les fichiers", () => {
    const turn: AgentEvent[] = [
      { kind: "edit", files: [{ path: "src/a.ts", add: 99, del: 99 }] } as AgentEvent,
      { kind: "edit", files: [{ path: "src/b.ts", add: null, del: null }] } as AgentEvent,
    ];
    const done = {
      kind: "done", ok: true,
      filesChanged: ["src/a.ts", "src/b.ts", "assets/logo.bin"],
      fileStats: [
        { path: "src/a.ts", add: 12, del: 4 },
        { path: "src/b.ts", add: 3, del: 0 },
        { path: "assets/logo.bin", add: null, del: null }, // binaire
      ],
    } as AgentEvent;
    expect(deriveChangedFiles(turn, done as Extract<AgentEvent, { kind: "done" }>)).toEqual([
      { path: "src/a.ts", name: "a.ts", add: 12, del: 4 },
      { path: "src/b.ts", name: "b.ts", add: 3, del: 0 },
      { path: "assets/logo.bin", name: "logo.bin", add: null, del: null },
    ]);
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
