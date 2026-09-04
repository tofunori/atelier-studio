// src/lib/streamCoalesce.test.ts
import { describe, expect, it, vi } from "vitest";
import { createStreamCoalescer, pacingBudget, STREAM_COALESCE_KINDS } from "./streamCoalesce";

describe("streamCoalesce", () => {
  it("connaît les kinds à lisser", () => {
    expect(STREAM_COALESCE_KINDS.has("delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("thinking_delta")).toBe(true);
    expect(STREAM_COALESCE_KINDS.has("streaming")).toBe(false);
  });

  it("applique tous les deltas d'une frame, dans l'ordre, en un seul flush", () => {
    const applied: Array<[string, any]> = [];
    let frameCb: (() => void) | null = null;
    const raf = vi.fn((cb: () => void) => { frameCb = cb; return 1; });
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]), raf, vi.fn());
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t1", { kind: "delta", text: "b" });
    expect(applied).toEqual([]);           // rien avant la frame
    expect(raf).toHaveBeenCalledTimes(1);  // un seul rAF par fil
    frameCb!();
    expect(applied.map(([, e]) => e.text)).toEqual(["a", "b"]); // ordre préservé
  });

  it("flush synchrone vide la file et annule le rAF", () => {
    const applied: any[] = [];
    const caf = vi.fn();
    const c = createStreamCoalescer((_id, ev) => applied.push(ev), () => 7, caf);
    c.push("t1", { kind: "delta", text: "a" });
    c.flush("t1");
    expect(applied).toHaveLength(1);
    expect(caf).toHaveBeenCalledWith(7);
    c.flush("t1"); // idempotent
    expect(applied).toHaveLength(1);
  });

  it("les fils sont indépendants", () => {
    const applied: Array<[string, any]> = [];
    const frames: Array<() => void> = [];
    const c = createStreamCoalescer((id, ev) => applied.push([id, ev]),
      (cb) => { frames.push(cb); return frames.length; }, () => {});
    c.push("t1", { kind: "delta", text: "a" });
    c.push("t2", { kind: "delta", text: "x" });
    frames[0]!();
    expect(applied).toEqual([["t1", { kind: "delta", text: "a" }]]);
  });

  // -- Harnais pour les scénarios de rythme -----------------------------
  // Horloge et rAF entièrement contrôlés : `runFrames` avance le temps par
  // pas de `stepMs` (simule la cadence d'affichage réelle, ~16 ms) et tire
  // la frame en attente à chaque pas — exactement comme le ferait un vrai
  // navigateur qui reprogramme un rAF tant que le tampon n'est pas vide.
  function makeHarness() {
    const clock = { t: 0 };
    const now = () => clock.t;
    let pending: (() => void) | null = null;
    const raf = vi.fn((cb: () => void) => { pending = cb; return 1; });
    const caf = vi.fn(() => { pending = null; });
    function fireIfPending(): boolean {
      const cb = pending;
      pending = null;
      if (!cb) return false;
      cb();
      return true;
    }
    function hasPending() {
      return pending != null;
    }
    function advanceTo(targetT: number, stepMs = 16) {
      while (clock.t < targetT) {
        clock.t = Math.min(clock.t + stepMs, targetT);
        fireIfPending();
      }
    }
    function jumpTo(targetT: number) {
      clock.t = targetT;
    }
    return { clock, now, raf, caf, fireIfPending, hasPending, advanceTo, jumpTo };
  }

  it("pacingBudget : ne découpe jamais un paquet fin, quel que soit le débit", () => {
    expect(pacingBudget({ remainingLen: 8, rateCharsPerMs: null, dtMs: 16, ageMs: 0 })).toBe(8);
    expect(pacingBudget({ remainingLen: 8, rateCharsPerMs: 0.01, dtMs: 16, ageMs: 0 })).toBe(8);
    expect(pacingBudget({ remainingLen: 32, rateCharsPerMs: 0.01, dtMs: 16, ageMs: 0 })).toBe(32);
  });

  it("scénario Fable : paquets de 120 caractères espacés — révélation progressive, jamais au-delà du reçu, 1er paquet fini avant ~900 ms", () => {
    const { now, raf, caf, advanceTo, jumpTo, hasPending, fireIfPending } = makeHarness();
    const revealed: Record<string, string> = {};
    const c = createStreamCoalescer((id, ev) => { revealed[id] = (revealed[id] ?? "") + ev.text; }, raf, caf, now);

    const packet = (n: number) => "x".repeat(n);

    c.push("t1", { kind: "delta", text: packet(120) });

    let firstDoneAt: number | null = null;
    let previousLen = 0;
    for (let guard = 0; guard < 200 && now() < 750; guard++) {
      if (!hasPending()) { advanceTo(Math.min(now() + 16, 750)); continue; }
      const before = revealed.t1?.length ?? 0;
      fireIfPending();
      const after = revealed.t1?.length ?? 0;
      expect(after).toBeGreaterThan(before); // croît strictement à chaque frame
      expect(after).toBeLessThanOrEqual(120); // jamais plus que le reçu
      if (after === 120 && firstDoneAt == null) firstDoneAt = now();
      previousLen = after;
      if (now() < 750) advanceTo(Math.min(now() + 16, 750));
    }
    expect(previousLen).toBe(120);
    expect(firstDoneAt).not.toBeNull();
    expect(firstDoneAt!).toBeLessThan(900);

    // 2e paquet à t=750
    jumpTo(750);
    c.push("t1", { kind: "delta", text: packet(120) });
    advanceTo(1500);
    expect(revealed.t1!.length).toBeLessThanOrEqual(240);

    // 3e paquet à t=1500, puis on laisse tourner jusqu'à tout recevoir
    c.push("t1", { kind: "delta", text: packet(120) });
    advanceTo(4000);
    expect(revealed.t1).toBe(packet(360)); // rien perdu, ordre respecté
  });

  it("scénario Sonnet : paquets de 8 caractères toutes les 45 ms — chaque paquet est intégralement appliqué, sans découpe", () => {
    const { now, raf, caf, advanceTo, jumpTo } = makeHarness();
    const appliedFragments: string[] = [];
    const c = createStreamCoalescer((_id, ev) => appliedFragments.push(ev.text), raf, caf, now);

    const packet = (n: number, ch: string) => ch.repeat(n);
    let t = 0;
    for (let i = 0; i < 6; i++) {
      jumpTo(t);
      c.push("t1", { kind: "delta", text: packet(8, String.fromCharCode(97 + i)) });
      advanceTo(t + 45);
      t += 45;
    }
    // aucun fragment n'a été tronqué : chaque paquet de 8 apparaît d'un bloc
    expect(appliedFragments.every((f) => f.length === 8)).toBe(true);
    expect(appliedFragments).toHaveLength(6);
  });

  it("flush en plein milieu applique tout le reste d'un coup, dans l'ordre", () => {
    const { now, raf, caf, advanceTo } = makeHarness();
    const appliedFragments: string[] = [];
    const c = createStreamCoalescer((_id, ev) => appliedFragments.push(ev.text), raf, caf, now);

    const full = "y".repeat(100);
    c.push("t1", { kind: "delta", text: full });
    advanceTo(16); // une frame : révélation partielle seulement
    expect(appliedFragments.join("").length).toBeGreaterThan(0);
    expect(appliedFragments.join("").length).toBeLessThan(100);

    c.flush("t1");
    expect(appliedFragments.join("")).toBe(full); // tout est sorti, rien perdu

    // un texte poussé après le flush est vu complet à son tour
    c.push("t1", { kind: "delta", text: "next" });
    c.flush("t1");
    expect(appliedFragments.join("")).toBe(full + "next");
  });

  it("un stream_set en file derrière un delta partiel n'est appliqué qu'après la fin de ce delta", () => {
    const { now, raf, caf, advanceTo } = makeHarness();
    const order: string[] = [];
    const c = createStreamCoalescer((_id, ev) => {
      if (ev.kind === "delta") order.push(`delta:${ev.text}`);
      else order.push(ev.kind);
    }, raf, caf, now);

    const full = "z".repeat(100);
    c.push("t1", { kind: "delta", text: full });
    c.push("t1", { kind: "stream_set", value: "on" });

    // tant que le delta n'est pas fini, stream_set n'apparaît pas dans `order`
    for (let guard = 0; guard < 200; guard++) {
      const doneAlready = order.includes("stream_set");
      advanceTo(now() + 16);
      if (order.includes("stream_set")) {
        // au moment où stream_set apparaît, tout le texte du delta doit
        // déjà avoir été appliqué avant lui
        const deltaTextSoFar = order.filter((o) => o.startsWith("delta:")).map((o) => o.slice(6)).join("");
        expect(deltaTextSoFar).toBe(full);
        expect(doneAlready).toBe(false);
        break;
      }
      if (guard === 199) throw new Error("stream_set jamais appliqué");
    }
  });

  it("découpe sûre : un delta avec emojis (paires de substituts) n'est jamais coupé au milieu d'un point de code", () => {
    const { now, raf, caf, advanceTo } = makeHarness();
    const fragments: string[] = [];
    const c = createStreamCoalescer((_id, ev) => fragments.push(ev.text), raf, caf, now);

    const emojiText = "😀🙂😅🚀🎉".repeat(15); // 75 points de code, >32 => découpé
    c.push("t1", { kind: "delta", text: emojiText });
    advanceTo(2000);

    expect(fragments.join("")).toBe(emojiText);
    for (const frag of fragments) {
      expect(frag).not.toMatch(/[\uD800-\uDBFF]$/); // ne finit pas par un haut isolé
      expect(frag).not.toMatch(/^[\uDC00-\uDFFF]/); // ne commence pas par un bas isolé
    }
  });

  it("plafond de latence : un paquet de 2000 caractères est entièrement révélé en moins de 1,5 s de frames", () => {
    const { now, raf, caf, advanceTo, hasPending } = makeHarness();
    const revealed: { text: string } = { text: "" };
    const c = createStreamCoalescer((_id, ev) => { revealed.text += ev.text; }, raf, caf, now);

    const full = "w".repeat(2000);
    c.push("t1", { kind: "delta", text: full });

    let doneAt: number | null = null;
    for (let guard = 0; guard < 500 && doneAt == null; guard++) {
      advanceTo(now() + 16);
      if (revealed.text.length === 2000 && !hasPending()) doneAt = now();
      if (guard === 499) throw new Error("jamais entièrement révélé");
    }
    expect(revealed.text).toBe(full);
    expect(doneAt).not.toBeNull();
    expect(doneAt!).toBeLessThan(1500);
  });

  it("un nouveau tour ne traîne pas le débit d'un tour vieux d'une minute", () => {
    const h = makeHarness();
    const applied: string[] = [];
    const c = createStreamCoalescer((_id, ev) => applied.push(ev.text), h.raf, h.caf, h.now);
    // tour 1 : deux paquets rapides, puis fin de tour (flush)
    c.push("t1", { kind: "delta", text: "x".repeat(120) });
    h.clock.t = 750;
    c.push("t1", { kind: "delta", text: "y".repeat(120) });
    c.flush("t1");
    // une minute de silence, puis le premier paquet du tour 2
    h.clock.t = 60_750;
    c.push("t1", { kind: "delta", text: "z".repeat(120) });
    const t0 = h.clock.t;
    let revealed = 0;
    while (revealed < 120 && h.clock.t - t0 < 2000) {
      h.clock.t += 16;
      if (!h.fireIfPending()) break;
      revealed = applied.join("").split("z").length - 1;
    }
    // sans historique hérité : révélation en ~250 ms, jamais 2 caractères/frame
    expect(revealed).toBe(120);
    expect(h.clock.t - t0).toBeLessThan(400);
  });
});
