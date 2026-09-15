// Typewriter du streaming (useSmoothedStream) : montage borné, révélation
// progressive du retard, FINITION déroulée en fin de tour (décision Thierry
// 2026-08-25 : « la réponse arrive tout d'un coup » — le flush téléportait
// tout le reliquat non révélé au done).
import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { publishStreamHandoff, streamTickTimer, takeStreamHandoff, useSmoothedStream } from "./useSmoothedStream";

describe("useSmoothedStream — typewriter du flux", () => {
  it("les deltas alimentent la même boucle, y compris lors de la finition", () => {
    const raf = vi.spyOn(streamTickTimer, "schedule").mockReturnValue(42);
    const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
    const view = renderHook(({ text, working }) => useSmoothedStream(text, working, "continuous-loop"), {
      initialProps: { text: "Premier paquet de texte.", working: true },
    });
    try {
      view.rerender({ text: "Premier paquet de texte. Deuxième paquet.", working: true });
      view.rerender({ text: "Premier paquet de texte. Deuxième paquet. Fin.", working: false });
      expect(raf).toHaveBeenCalledTimes(1);
      expect(cancel).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      raf.mockRestore(); cancel.mockRestore();
    }
  });

  it("une reprise après une pause ne révèle pas un paquet entier à la première frame", () => {
    let now = 0;
    let pending: (() => void) | null = null;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const raf = vi.spyOn(streamTickTimer, "schedule").mockImplementation(callback => { pending = callback; return 1; });
    const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
    const initial = "Un début.";
    const view = renderHook(({ text }) => useSmoothedStream(text, true, "idle-resume"), { initialProps: { text: initial } });
    try {
      for (let i = 0; i < 60 && pending; i++) {
        now += 16;
        const callback: () => void = pending;
        pending = null;
        act(() => callback());
      }
      expect(view.result.current).toBe(initial);
      now += 10000;
      view.rerender({ text: initial + " glacier".repeat(30) });
      now += 16;
      act(() => pending?.());
      expect(view.result.current.length - initial.length).toBeLessThan(30);
      expect(view.result.current.length).toBeGreaterThan(initial.length);
    } finally {
      view.unmount(); clock.mockRestore(); raf.mockRestore(); cancel.mockRestore();
    }
  });

  // Banc chat_stream_bench (2026-09-15) : un delta « mot␣ » donnait DEUX
  // publications — le mot (snap en fin de mot), puis l'espace seul une frame
  // plus tard (« cible atteinte → publier tout de suite »). Sur des paquets
  // fins (Sonnet, 20/s), c'était deux fois plus de rendus Markdown que de
  // deltas. Le snap avale maintenant l'espace qui suit le mot, et la limite
  // de 40 ms vaut aussi pour la cible atteinte pendant le tour.
  it("un delta « mot␣ » se publie en une fois, jamais le mot puis l'espace", () => {
    let now = 0;
    let pending: (() => void) | null = null;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const raf = vi.spyOn(streamTickTimer, "schedule").mockImplementation(callback => { pending = callback; return 1; });
    const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
    const published: string[] = [];
    const view = renderHook(({ text, working }) => { const out = useSmoothedStream(text, working, "word-space"); published.push(out); return out; }, { initialProps: { text: "Début ", working: true } });
    try {
      for (let f = 0; f < 60 && pending; f++) { now += 8; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb()); }
      expect(view.result.current).toBe("Début ");
      published.length = 0;
      now += 48;
      view.rerender({ text: "Début nuages ", working: true });
      for (let f = 0; f < 60 && pending; f++) { now += 8; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb()); }
      expect(view.result.current).toBe("Début nuages ");
      const steps = [...new Set(published)].filter(v => v !== "Début ");
      expect(steps).toEqual(["Début nuages "]);
    } finally {
      view.unmount(); clock.mockRestore(); raf.mockRestore(); cancel.mockRestore();
    }
  });

  it("pendant le tour, une cible atteinte moins de 40 ms après la dernière publication attend la frame suivante", () => {
    let now = 0;
    let pending: (() => void) | null = null;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const raf = vi.spyOn(streamTickTimer, "schedule").mockImplementation(callback => { pending = callback; return 1; });
    const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
    let renders = 0;
    const view = renderHook(({ text, working }) => { renders += 1; return useSmoothedStream(text, working, "gate"); }, { initialProps: { text: "Un ", working: true } });
    try {
      for (let f = 0; f < 60 && pending; f++) { now += 8; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb()); }
      // deltas de 3 caractères toutes les 16 ms (rafale) pendant 400 ms
      const before = renders;
      let text = "Un ";
      for (let k = 0; k < 25; k++) {
        text += "ab ";
        now += 8; view.rerender({ text, working: true });
        now += 8; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb());
      }
      for (let f = 0; f < 30 && pending; f++) { now += 8; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb()); }
      expect(view.result.current).toBe(text);
      const publishes = renders - before - 25;
      // 25 deltas sur 400 ms : sans limite ≈ 25 publications ; avec, ≤ 400/40 + 2
      expect(publishes).toBeLessThanOrEqual(12);
      expect(publishes).toBeGreaterThanOrEqual(5);
      // fin du tour : sans attendre
      text += "fin.";
      now += 1; view.rerender({ text, working: false });
      for (let f = 0; f < 10 && pending; f++) { now += 1; const cb = pending as (() => void) | null; pending = null; if (cb) act(() => cb()); }
      expect(view.result.current).toBe(text);
    } finally {
      view.unmount(); clock.mockRestore(); raf.mockRestore(); cancel.mockRestore();
    }
  });

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
    await waitFor(() => expect(result.current).toBe(texte), { timeout: 2000 });
    expect(takeStreamHandoff("row-1")).toBeNull(); // libéré après la finition
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

  it("compléter les mots respecte le débit sur une seconde", () => {
    const p = newStreamPace(0);
    const full = "glacier ".repeat(100);
    p.rate = 90;
    // Petit retard constant : le plancher domine le rattrapage.
    for (let now = 16; now <= 1000; now += 16) {
      paceStep(p, full.slice(0, p.revealed + 16), now);
    }
    // 90 chars/s + au plus un mot anticipé ; ancien snap : ~500 chars/s.
    expect(p.revealed).toBeGreaterThan(80);
    expect(p.revealed).toBeLessThan(105);
  });

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
        // jamais en plein mot : le pas s'arrête après le blanc qui suit le mot
        // (ou, à la limite, juste devant lui)
        expect(/\s/.test(full[p.revealed - 1]) || /\s/.test(full[p.revealed])).toBe(true);
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


it("à 120 Hz, publie à cadence bornée sans laisser les rendus parents avancer le texte", () => {
  let now = 0;
  let callback: (() => void) | undefined;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  const raf = vi.spyOn(streamTickTimer, "schedule").mockImplementation(cb => { callback = cb; return 1; });
  const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
  const text = "glacier ".repeat(1000);
  const view = renderHook(() => useSmoothedStream(text, true, "cadence-120"));
  let changes = 0;
  let previous = view.result.current;
  try {
    for (let i = 0; i < 120; i++) {
      now += 1000 / 120;
      act(() => callback?.());
      const published = view.result.current;
      view.rerender();
      expect(view.result.current).toBe(published);
      if (published !== previous) changes += 1;
      previous = published;
    }
    expect(changes).toBeLessThanOrEqual(26);
    expect(changes).toBeGreaterThan(10);
    now += 16;
    while (view.result.current !== text && now < 4000) {
      act(() => callback?.());
      now += 16;
    }
    expect(view.result.current).toBe(text);
  } finally {
    view.unmount(); clock.mockRestore(); raf.mockRestore(); cancel.mockRestore();
  }
});

it("une cible raccourcie entre deux publications finit de s'afficher", () => {
  let now = 0;
  let callback: (() => void) | undefined;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  const raf = vi.spyOn(streamTickTimer, "schedule").mockImplementation(cb => { callback = cb; return 1; });
  const cancel = vi.spyOn(streamTickTimer, "cancel").mockImplementation(() => {});
  const text = "x ".repeat(200);
  const view = renderHook(({ text }) => useSmoothedStream(text, true, "short-snapshot"), { initialProps: { text } });
  try {
    now = 16; act(() => callback?.());
    const first = view.result.current.length;
    now = 32; act(() => callback?.());
    expect(view.result.current.length).toBe(first);
    const corrected = text.slice(0, first + 2);
    view.rerender({ text: corrected });
    expect(view.result.current).toBe(corrected);
  } finally {
    view.unmount(); clock.mockRestore(); raf.mockRestore(); cancel.mockRestore();
  }
});


it("un remontage de la même bulle ne retire pas les mots déjà visibles", async () => {
  const text = "Il faudrait dimensionner et valider le traitement avant de lancer l’ensemble.";
  const first = renderHook(() => useSmoothedStream(text, true, "remount-live"));
  await waitFor(() => expect(first.result.current).toBe(text));
  first.unmount();
  const second = renderHook(() => useSmoothedStream(text + " Puis vérifier les résultats.", true, "remount-live"));
  expect(second.result.current.startsWith(text)).toBe(true);
  await waitFor(() => expect(second.result.current).toBe(text + " Puis vérifier les résultats."));
  second.unmount();
});

it("le double rendu StrictMode conserve le même relais vers la finition", () => {
  publishStreamHandoff("strict-final", 15);
  const text = "Une réponse terminée dont la fin reste à dérouler.";
  const view = renderHook(() => useSmoothedStream(text, false, "strict-final"), { wrapper: StrictMode });
  expect(view.result.current).toBe(text.slice(0, 15));
  view.unmount();
});
