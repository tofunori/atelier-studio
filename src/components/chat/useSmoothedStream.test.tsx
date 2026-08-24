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

// Moteur pur du débit (plan lissage 2026-08-24) : débit constant adapté au
// flux d'arrivée au lieu du drainage proportionnel — testé à horloge simulée,
// donc sans dépendre du vrai rAF.
import { newStreamPace, paceGrowth, paceStep } from "./turns";

describe("paceStep — débit constant adaptatif", () => {
  const texte = (n: number) => Array.from({ length: Math.ceil(n / 6) }, (_, i) => `mot${String(i).padStart(2, "0")}`).join(" ").slice(0, n);

  it("une rafale ne provoque pas de pointe : la révélation reste proche du débit d'arrivée", () => {
    const p = newStreamPace(0);
    // flux régulier à ~100 chars/s : 50 chars toutes les 500 ms
    let full = "";
    for (let t = 500; t <= 2000; t += 500) {
      full = texte((t / 500) * 50);
      paceGrowth(p, full.length, t);
    }
    // grosse rafale : +600 chars d'un coup à t=2000
    full = texte(full.length + 600);
    paceGrowth(p, full.length, 2000);
    // premier tick après la rafale (33 ms) : l'ancien drainage 12 % aurait
    // révélé ~72 chars ; le débit adaptatif reste borné par arrivée + rattrapage
    p.revealed = 200; p.lastTickAt = 2000;
    paceStep(p, full, 2033);
    const step1 = p.revealed - 200;
    expect(step1).toBeGreaterThan(0);
    expect(step1).toBeLessThan(45); // ~(100 cps adapté + rattrapage τ) * 33 ms, marge word-snap
  });

  it("le retard converge : un gros backlog est résorbé en moins de ~2,5 s", () => {
    const p = newStreamPace(0);
    const full = texte(600);
    paceGrowth(p, full.length, 0);
    let t = 0;
    while (p.revealed < full.length && t < 2500) {
      t += 33;
      paceStep(p, full, t);
    }
    expect(p.revealed).toBe(full.length);
  });

  it("jamais de gel : un petit retard progresse même sans nouveau flux", () => {
    const p = newStreamPace(0);
    const full = texte(30);
    paceGrowth(p, full.length, 0);
    paceStep(p, full, 33);
    expect(p.revealed).toBeGreaterThan(0);
  });

  it("frontière de mot : chaque état intermédiaire finit un mot entier", () => {
    const p = newStreamPace(0);
    const full = texte(300);
    paceGrowth(p, full.length, 0);
    let t = 0;
    while (p.revealed < full.length && t < 5000) {
      t += 33;
      paceStep(p, full, t);
      if (p.revealed < full.length) {
        expect(/\s/.test(full[p.revealed])).toBe(true);
      }
    }
  });

  it("le débit s'adapte : flux lent → révélation lente (pas de rattrapage brutal)", () => {
    const p = newStreamPace(0);
    // flux lent ~40 chars/s pendant 3 s
    let full = "";
    for (let t = 1000; t <= 3000; t += 1000) {
      full = texte((t / 1000) * 40);
      paceGrowth(p, full.length, t);
    }
    // le débit estimé reste dans l'ordre de grandeur du flux réel
    expect(p.rate).toBeGreaterThan(15);
    expect(p.rate).toBeLessThan(90);
  });
});
