// Typewriter du streaming (useSmoothedStream) : montage borné, révélation
// progressive du retard, FINITION déroulée en fin de tour (décision Thierry
// 2026-08-25 : « la réponse arrive tout d'un coup » — le flush téléportait
// tout le reliquat non révélé au done).
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { publishStreamHandoff, takeStreamHandoff, useSmoothedStream } from "./useSmoothedStream";

describe("useSmoothedStream — typewriter du flux", () => {
  it("au montage d'un tour frais, la révélation part du début", async () => {
    // Le premier delta d'un provider rapide (grok) peut faire 800 caractères :
    // affiché d'un bloc au montage, c'était le début du « tout d'un coup ».
    const texte = "Premier delta assez court d'un tour qui vient de démarrer.";
    const { result } = renderHook(() => useSmoothedStream(texte, true, "row-frais"));
    expect(result.current.length).toBeLessThan(texte.length);
    await waitFor(() => expect(result.current).toBe(texte), { timeout: 3000 });
  });

  it("à la reprise d'un fil déjà long, seule une queue bornée se rejoue", () => {
    const long = "mot ".repeat(800); // 3200 caractères déjà reçus
    const { result } = renderHook(() => useSmoothedStream(long, true, "row-reprise"));
    // l'essentiel s'affiche tout de suite : on ne rejoue pas 3000 caractères
    expect(result.current.length).toBeGreaterThan(long.length - 700);
  });

  it("sans clé de relais (pensée vivante), le montage n'a pas de replay", () => {
    const texte = "Bloc de pensée déjà présent quand l'indicateur se remonte.";
    const { result } = renderHook(() => useSmoothedStream(texte, true));
    expect(result.current).toBe(texte);
  });

  it("un morceau qui arrive se révèle progressivement puis en entier", async () => {
    const initial = "Début.";
    const grown = "Début. Puis un morceau nettement plus long arrive d'un coup, à l'échelle d'une phrase complète comme le CLI le fait.";
    const { result, rerender } = renderHook(
      ({ text, working }: { text: string; working: boolean }) => useSmoothedStream(text, working),
      { initialProps: { text: initial, working: true } },
    );
    // montage d'un tour frais : la révélation démarre (préfixe, pas un bloc)
    expect(initial.startsWith(result.current)).toBe(true);
    rerender({ text: grown, working: true });
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

  it("fin de tour : le reliquat se déroule vite mais sans téléportation", async () => {
    const grown = "Un long texte encore en cours de révélation au moment du done. " +
      "Il reste plusieurs phrases entières à montrer, et elles doivent défiler " +
      "rapidement plutôt que d'apparaître d'un seul bloc à l'écran.";
    const { result, rerender } = renderHook(
      ({ text, working }: { text: string; working: boolean }) => useSmoothedStream(text, working),
      { initialProps: { text: "Un", working: true } },
    );
    rerender({ text: grown, working: true });
    rerender({ text: grown, working: false });
    // pas de téléportation : l'état juste après le done est encore partiel…
    expect(result.current.length).toBeLessThan(grown.length);
    // …mais la finition s'achève vite (< ~1,5 s)
    await waitFor(() => expect(result.current).toBe(grown), { timeout: 2000 });
  });

  it("relais bulle → texte final : la révélation continue au même point", async () => {
    // Au done, le reducer remplace la bulle streaming par le texte final :
    // l'ancien composant meurt avec son état. Le compte révélé se relaie par
    // la clé de rangée (stable depuis le fix du flash) pour que le texte
    // final CONTINUE la frappe au lieu d'apparaître entier.
    publishStreamHandoff("row-1", 10);
    const texte = "Un texte final dont seule la première partie était révélée au moment du remplacement.";
    const { result } = renderHook(() => useSmoothedStream(texte, false, "row-1"));
    expect(result.current.length).toBeLessThan(texte.length);
    expect(takeStreamHandoff("row-1")).toBeNull(); // consommé
    await waitFor(() => expect(result.current).toBe(texte), { timeout: 2000 });
  });

  it("sans relais, un texte final monté hors tour s'affiche entier", () => {
    const texte = "Relecture d'un vieux message : aucun typewriter.";
    const { result } = renderHook(() => useSmoothedStream(texte, false, "row-inconnue"));
    expect(result.current).toBe(texte);
  });
});

// Moteur pur du débit (plan lissage 2026-08-24) : débit constant adapté au
// flux d'arrivée au lieu du drainage proportionnel — testé à horloge simulée,
// donc sans dépendre du vrai rAF.
import { newStreamPace, paceGrowth, paceStep } from "./useSmoothedStream";

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

  it("cadence Claude réelle (95 chars / 310 ms) : révélation continue, jamais par bloc", () => {
    // Cadence MESURÉE au WS le 2026-08-25 : 11 deltas de ~95 caractères
    // toutes les ~310 ms (« la réponse arrive tout d'un coup » — ce test fixe
    // ce que le moteur doit faire de cette cadence : du continu).
    const p = newStreamPace(0);
    const mot = "glace ";
    let full = "";
    let t = 0;
    let plusGrandSaut = 0;
    let precedent = 0;
    for (let delta = 0; delta < 11; delta += 1) {
      full += mot.repeat(16); // ~96 chars
      paceGrowth(p, full.length, t);
      const fin = t + 310;
      while (t < fin) {
        t += 16; // une frame 60 Hz
        paceStep(p, full, t);
        plusGrandSaut = Math.max(plusGrandSaut, p.revealed - precedent);
        precedent = p.revealed;
      }
    }
    // continue : jamais plus d'une dizaine de caractères par frame (un mot),
    // et le retard ne s'accumule pas au point d'un flush massif en fin de tour
    expect(plusGrandSaut).toBeLessThanOrEqual(24);
    expect(p.revealed).toBeGreaterThan(full.length * 0.7);
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
