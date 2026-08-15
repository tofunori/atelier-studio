// Typewriter du streaming (useSmoothedStream) : montage sans replay,
// révélation progressive du retard, flush immédiat en fin de tour.
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSmoothedStream } from "./turns";

describe("useSmoothedStream — typewriter du flux", () => {
  it("au montage, le texte déjà présent s'affiche entièrement (pas de replay)", () => {
    const { result } = renderHook(() => useSmoothedStream("Texte déjà reçu avant l'ouverture.", true));
    expect(result.current).toBe("Texte déjà reçu avant l'ouverture.");
  });

  it("un morceau qui arrive se révèle progressivement puis en entier", async () => {
    const initial = "Début.";
    const grown = "Début. Puis un morceau nettement plus long arrive d'un coup, à l'échelle d'une phrase complète comme le CLI le fait.";
    const { result, rerender } = renderHook(
      ({ text, working }: { text: string; working: boolean }) => useSmoothedStream(text, working),
      { initialProps: { text: initial, working: true } },
    );
    expect(result.current).toBe(initial);
    rerender({ text: grown, working: true });
    // jamais moins que ce qui était déjà révélé, jamais plus que la cible
    expect(result.current.length).toBeGreaterThanOrEqual(initial.length);
    expect(grown.startsWith(result.current)).toBe(true);
    // le drainage proportionnel converge en ~1 s
    await waitFor(() => expect(result.current).toBe(grown), { timeout: 3000 });
  });

  it("fin de tour : flush immédiat du texte complet", () => {
    const grown = "Un long texte encore en cours de révélation au moment du done.";
    const { result, rerender } = renderHook(
      ({ text, working }: { text: string; working: boolean }) => useSmoothedStream(text, working),
      { initialProps: { text: "Un", working: true } },
    );
    rerender({ text: grown, working: true });
    rerender({ text: grown, working: false });
    expect(result.current).toBe(grown);
  });
});
