import { describe, expect, it } from "vitest";
import { activeMargeIndex, deriveMargeEntries, margeLabel, sameMargeEntries } from "./marge";

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

describe("les surlignages dans la marge", () => {
  const FIL_HL = [
    { kind: "user", text: "Et la pente ?" },
    { kind: "text", text: "La pente moyenne est de −0,00899 Gt an⁻¹ sur 22 ans." },
  ];

  it("dépose une encoche à la hauteur du message qui porte le passage", () => {
    const entries = deriveMargeEntries(FIL_HL, [], [{ text: "−0,00899 Gt an⁻¹", kind: "hl" }]);
    expect(entries).toEqual([
      { index: 0, kind: "prompt", label: "Et la pente ?" },
      { index: 1, kind: "hl", label: "−0,00899 Gt an⁻¹" },
    ]);
  });

  it("laisse cohabiter l'épingle du message et l'encoche du passage", () => {
    const entries = deriveMargeEntries(
      FIL_HL,
      [{ index: 1, label: "La pente" }],
      [{ text: "−0,00899 Gt an⁻¹", kind: "hl" }],
    );
    expect(entries.map((e) => e.kind)).toEqual(["prompt", "pin", "hl"]);
  });

  it("ignore un passage qu'aucun message ne porte plus", () => {
    const entries = deriveMargeEntries(FIL_HL, [], [{ text: "passage effacé", kind: "hl" }]);
    expect(entries.map((e) => e.kind)).toEqual(["prompt"]);
  });
});

describe("activeMargeIndex — l'entrée où l'on lit", () => {
  const ENTRIES = deriveMargeEntries(
    [
      { kind: "user", text: "Un" },
      { kind: "text", text: "réponse" },
      { kind: "user", text: "Deux" },
      { kind: "user", text: "Trois" },
    ],
    [],
  );

  it("désigne le dernier message passé sous le haut de la fenêtre", () => {
    // Un est remonté (-120), Deux est juste sous le bord (-4), Trois arrive
    expect(activeMargeIndex(ENTRIES, { 0: -120, 2: -4, 3: 260 })).toBe(2);
  });

  it("retombe sur la première entrée visible quand rien n'est encore passé", () => {
    expect(activeMargeIndex(ENTRIES, { 0: 40, 2: 300, 3: 560 })).toBe(0);
  });

  it("ne désigne rien quand aucune entrée n'est mesurée", () => {
    expect(activeMargeIndex(ENTRIES, {})).toBeNull();
  });

  it("ignore une entrée dont la rangée n'est pas rendue (fil virtualisé)", () => {
    // seule Trois est mesurée : c'est elle, même si Un et Deux la précèdent
    expect(activeMargeIndex(ENTRIES, { 3: -10 })).toBe(3);
  });

  // Mesuré 2026-08-23 : au bas du fil, la barre restait au milieu — la
  // dernière question était encore à mi-écran, donc « pas passée » sous la
  // ligne de lecture, et les vieilles bulles occupaient le haut.
  it("désigne la dernière entrée au bas du fil, même non mesurable", () => {
    expect(activeMargeIndex(ENTRIES, { 0: -120, 2: 40 }, 8, true)).toBe(3);
  });

  it("laisse la ligne de lecture (slack élargi) désigner la question qu'on lit", () => {
    // Deux est à 180 px du haut, la ligne de lecture au tiers d'une fenêtre
    // de 900 px (300) : on lit bien le tour de Deux, pas celui d'avant
    expect(activeMargeIndex(ENTRIES, { 0: -400, 2: 180, 3: 700 }, 300)).toBe(2);
  });
});
