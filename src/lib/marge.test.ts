import { describe, expect, it } from "vitest";
import { deriveMargeEntries, margeLabel, sameMargeEntries } from "./marge";

const FIL = [
  { kind: "user", text: "Vérifie d'où vient le −0,00975" },
  { kind: "tool_update", text: "" },
  { kind: "text", text: "La découverte : le −0,00975 vient de l'ancien run." },
  { kind: "user", text: "   " },
];

describe("deriveMargeEntries", () => {
  it("dépose un repère par question posée, et rien pour les outils", () => {
    expect(deriveMargeEntries(FIL, [])).toEqual([
      { index: 0, kind: "prompt", label: "Vérifie d'où vient le −0,00975" },
    ]);
  });

  it("hisse en épingle le message épinglé, avec le nom donné par l'épingle", () => {
    const entries = deriveMargeEntries(FIL, [{ index: 2, label: "La découverte" }]);
    expect(entries).toEqual([
      { index: 0, kind: "prompt", label: "Vérifie d'où vient le −0,00975" },
      { index: 2, kind: "pin", label: "La découverte" },
    ]);
  });

  it("ne compte qu'une fois une question épinglée", () => {
    const entries = deriveMargeEntries(FIL, [{ index: 0, label: "Ma question" }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ index: 0, kind: "pin", label: "Ma question" });
  });
});

describe("margeLabel", () => {
  it("compacte les espaces et tronque — un rail se lit d'un œil", () => {
    expect(margeLabel("  deux   lignes\net une suite ")).toBe("deux lignes et une suite");
    expect(margeLabel("m".repeat(100))).toHaveLength(72);
    expect(margeLabel("m".repeat(100)).endsWith("…")).toBe(true);
  });
});

describe("sameMargeEntries", () => {
  it("reconnaît deux dérivations identiques — pas de re-rendu pendant le stream", () => {
    const a = deriveMargeEntries(FIL, []);
    const b = deriveMargeEntries(FIL, []);
    expect(a).not.toBe(b);
    expect(sameMargeEntries(a, b)).toBe(true);
  });

  it("distingue un fil qui a gagné une question", () => {
    const a = deriveMargeEntries(FIL, []);
    const b = deriveMargeEntries([...FIL, { kind: "user", text: "Et ensuite ?" }], []);
    expect(sameMargeEntries(a, b)).toBe(false);
  });
});
