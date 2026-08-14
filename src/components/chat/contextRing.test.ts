// L'anneau de contexte ne doit crier qu'au moment où l'utilisateur a une
// décision à prendre (compacter, repartir à neuf) — pas dès la mi-fenêtre.
import { describe, expect, it } from "vitest";
import { contextRingStroke } from "./ComposerControls";

describe("contextRingStroke", () => {
  it("reste neutre tant que la compaction n'approche pas", () => {
    for (const pct of [0, 42, 61, 75, 80]) {
      expect(contextRingStroke(pct)).toBe("var(--mark-neutral-strong)");
    }
  });

  it("prend un doré éteint quand la compaction approche", () => {
    const stroke = contextRingStroke(85);
    expect(stroke).toContain("--status-warning");
    // Mélangé au gris : jamais la couleur de statut pleine.
    expect(stroke).toContain("--mark-neutral-strong");
  });

  it("passe au rouge au bord de la fenêtre", () => {
    expect(contextRingStroke(95)).toBe("var(--status-error)");
  });
});
