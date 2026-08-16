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

  it("la révélation tombe sur une frontière de mot (plan 067) — jamais un mot tronqué", async () => {
    const initial = "Départ.";
    const grown = "Départ. Ensuite plusieurs mots supplémentaires arrivent pour vérifier que chaque étape intermédiaire se termine à la fin d'un mot entier.";
    const { result, rerender } = renderHook(
      ({ text, working }: { text: string; working: boolean }) => useSmoothedStream(text, working),
      { initialProps: { text: initial, working: true } },
    );
    rerender({ text: grown, working: true });
    await waitFor(() => {
      const cur = result.current;
      if (cur !== grown) {
        // état intermédiaire observé : le caractère suivant est un blanc
        // (le mot courant est entier) — le cap +24 ne joue pas ici, le
        // texte n'a aucun run sans espace de cette longueur.
        expect(/\s/.test(grown[cur.length])).toBe(true);
        throw new Error("révélation en cours");
      }
      expect(cur).toBe(grown);
    }, { timeout: 3000 });
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
