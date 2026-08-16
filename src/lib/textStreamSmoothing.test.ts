// Lissage de cadence du texte streamé (lot 066-bis) — tests du module pur
// (indépendant de React/App.tsx) : cadence par mots entiers, accélération
// bornée sur backlog, flush ordonné, reduced-motion, onglet masqué.
import { describe, expect, it, vi } from "vitest";
import {
  frameCharBudget,
  peelWords,
  tokenizeBuffered,
  TextStreamSmoother,
  WORD_BUFFER_BACKLOG_DIVISOR,
  WORD_BUFFER_BACKLOG_THRESHOLD,
  WORD_BUFFER_BASE_CHARS,
} from "./textStreamSmoothing";

/** rAF manuel : chaque frame avance l'horloge simulée de `frameMs` avant
 * d'exécuter le callback — permet de mesurer une latence simulée sans timers
 * réels ni dépendre du support rAF des fake timers vitest. */
function makeManualClock(frameMs = 16) {
  let now = 0;
  let queue: Array<{ handle: number; cb: (t: number) => void }> = [];
  let nextHandle = 1;
  const raf = (cb: (t: number) => void) => {
    const handle = nextHandle++;
    queue.push({ handle, cb });
    return handle;
  };
  const caf = (handle: number) => {
    queue = queue.filter((q) => q.handle !== handle);
  };
  /** Exécute toutes les frames actuellement en file (une génération), en
   * avançant l'horloge de `frameMs` avant chacune — répéter pour simuler
   * plusieurs frames successives. Retourne le nombre de callbacks exécutés. */
  const tick = (): number => {
    const batch = queue;
    queue = [];
    for (const { cb } of batch) {
      now += frameMs;
      cb(now);
    }
    return batch.length;
  };
  return { raf, caf, tick, now: () => now, pending: () => queue.length };
}

describe("frameCharBudget — cadence adaptative bornée", () => {
  it("base ~1-2 mots/frame sous le seuil de backlog", () => {
    expect(frameCharBudget(0)).toBe(WORD_BUFFER_BASE_CHARS);
    expect(frameCharBudget(WORD_BUFFER_BACKLOG_THRESHOLD)).toBe(WORD_BUFFER_BASE_CHARS);
  });
  it("accélère proportionnellement au-delà du seuil (backlog/20)", () => {
    const backlog = 5000;
    expect(frameCharBudget(backlog)).toBe(Math.max(WORD_BUFFER_BASE_CHARS, backlog / WORD_BUFFER_BACKLOG_DIVISOR));
    expect(frameCharBudget(backlog)).toBeGreaterThan(WORD_BUFFER_BASE_CHARS);
  });
});

describe("tokenizeBuffered / peelWords — jamais couper un mot", () => {
  it("découpage sans perte : la concaténation reconstitue le buffer exact", () => {
    const s = "Bonjour, le glacier Saskatchewan recule.  Vite.";
    expect(tokenizeBuffered(s).join("")).toBe(s);
  });
  it("ne prélève jamais le dernier mot s'il n'est pas suivi d'espace (encore incomplet)", () => {
    const { revealed, rest } = peelWords("Bonjour le mond", 100);
    expect(revealed).toBe("Bonjour le "); // "mond" retenu : peut encore grandir en "monde"
    expect(rest).toBe("mond");
    expect(revealed + rest).toBe("Bonjour le mond");
  });
  it("la ponctuation reste attachée au mot précédent", () => {
    const { revealed } = peelWords("Bonjour, le glacier recule. ", 5);
    expect(revealed.startsWith("Bonjour,")).toBe(true);
  });
  it("préserve les entités multi-octets (emoji, accents) sans les couper", () => {
    const s = "Glacier 🏔️ en recul, très marqué. ";
    const { revealed, rest } = peelWords(s, 1000); // budget large : tout est complet (espace final)
    expect(revealed).toBe(s);
    expect(rest).toBe("");
    // aucun caractère de remplacement (couple surrogate cassé) dans le résultat
    expect(revealed).not.toContain("�");
  });
  it("un mot anormalement long sans espace (URL, CJK) finit par se libérer par sécurité", () => {
    const longToken = "a".repeat(500);
    const { revealed, rest } = peelWords(longToken, 12);
    expect(revealed.length).toBeGreaterThan(0);
    expect(revealed.length).toBeLessThan(longToken.length);
    expect(revealed + rest).toBe(longToken);
  });
});

describe("TextStreamSmoother — cadence régulière par mots", () => {
  it("un gros chunk unique se révèle en au moins 5 étapes régulières", () => {
    const clock = makeManualClock();
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    // pas d'espace final : le dernier mot ("l'albédo.") reste donc en
    // réserve tant que rien ne prouve qu'il est terminé — exactement comme
    // un delta réseau qui s'arrête au milieu d'une phrase. Le tick seul ne
    // le révèle jamais (§"jamais couper un mot") ; seul flush() (fin de
    // tour, testé séparément) le fait sortir — d'où le flush() final ici,
    // qui exerce aussi la continuité tick-par-tick puis flush.
    const chunk = "Je lance le calcul des tendances par région. Les premières valeurs "
      + "pour Coast et Rockies sont cohérentes avec la littérature récente sur l'albédo.";
    smoother.pushDelta("t1", chunk);
    let steps = 0;
    while (clock.pending() > 0 && steps < 200) {
      clock.tick();
      steps += 1;
    }
    expect(steps).toBeGreaterThanOrEqual(5);
    expect(applied.length).toBeGreaterThanOrEqual(5);
    // avant le flush final : jamais plus que la cible, toujours un préfixe
    expect(chunk.startsWith(applied.join(""))).toBe(true);
    smoother.flush("t1", { endTurn: true });
    // reconstruction fidèle, dans l'ordre, jamais plus que la cible
    expect(applied.join("")).toBe(chunk);
  });

  it("flush() vide le buffer immédiatement et intégralement (fin de tour)", () => {
    const clock = makeManualClock();
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    smoother.pushDelta("t1", "Un texte assez long qui n'a pas fini de se révéler quand le tour se termine.");
    // une seule frame consommée : le buffer n'est pas encore vide
    clock.tick();
    expect(applied.join("").length).toBeLessThan(
      "Un texte assez long qui n'a pas fini de se révéler quand le tour se termine.".length,
    );
    const before = applied.join("");
    smoother.flush("t1", { endTurn: true });
    expect(applied.join("")).toBe(
      "Un texte assez long qui n'a pas fini de se révéler quand le tour se termine.",
    );
    expect(applied.join("").length).toBeGreaterThan(before.length);
    // plus rien de programmé après flush (pas de double application)
    expect(clock.pending()).toBe(0);
  });

  it("ordre préservé : flush() applique tout AVANT qu'un événement non textuel ne s'applique", () => {
    const clock = makeManualClock();
    const timeline: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => timeline.push(`text:${text}`),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    smoother.pushDelta("t1", "Réflexion en cours sur les données glaciaires disponibles ici.");
    // un événement non textuel arrive avant que le buffer n'ait fini de se
    // vider tout seul : le flush doit précéder l'application de cet événement
    smoother.flush("t1");
    timeline.push("thinking:Je dois vérifier la source.");
    expect(timeline[timeline.length - 2]).toMatch(/^text:/);
    expect(timeline[timeline.length - 1]).toBe("thinking:Je dois vérifier la source.");
    expect(
      timeline.filter((e) => e.startsWith("text:")).map((e) => e.slice(5)).join(""),
    ).toBe("Réflexion en cours sur les données glaciaires disponibles ici.");
  });

  it("prefers-reduced-motion : passthrough, aucune frame programmée", () => {
    const clock = makeManualClock();
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => true,
    });
    const chunk = "Texte qui doit s'afficher d'un coup, sans lissage, sous reduced-motion.";
    smoother.pushDelta("t1", chunk);
    expect(applied.join("")).toBe(chunk); // déjà appliqué, synchrone
    expect(clock.pending()).toBe(0); // aucune frame programmée
  });

  it("onglet masqué : bascule sur un setTimeout de secours plutôt que de geler", () => {
    const applied: string[] = [];
    const timers: Array<{ cb: () => void; ms: number }> = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: () => {
        throw new Error("rAF ne doit jamais être utilisé quand l'onglet est masqué");
      },
      caf: () => {},
      setTimeoutFn: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
      clearTimeoutFn: () => {},
      isHidden: () => true,
      prefersReducedMotion: () => false,
    });
    // espace final : le dernier mot est "complet", pure boucle de timers
    // suffit à tout révéler (pas besoin d'un flush de fin de tour ici — testé
    // ailleurs — ce test porte sur la bascule rAF→setTimeout elle-même).
    const message = "Un message qui continue d'arriver pendant que l'onglet est en arrière-plan. ";
    smoother.pushDelta("t1", message);
    expect(timers.length).toBe(1);
    let guard = 0;
    while (timers.length > 0 && guard < 200) {
      const t = timers.shift()!;
      t.cb();
      guard += 1;
    }
    expect(applied.join("")).toBe(message);
  });

  it("backlog de 5000 caractères : rattrapage en moins de 500 ms simulées", () => {
    const clock = makeManualClock(16); // ~60 Hz
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    const words: string[] = [];
    while (words.join(" ").length < 5000) words.push("albedo");
    // espace final : dernier mot "complet", la latence mesurée ici est celle
    // du rattrapage du backlog, pas l'attente du mot suivant (couvert par
    // "ne prélève jamais le dernier mot…" plus haut).
    const chunk = `${words.join(" ")} `;
    smoother.pushDelta("t1", chunk);
    let guard = 0;
    while (clock.pending() > 0 && guard < 2000) {
      clock.tick();
      guard += 1;
    }
    expect(applied.join("")).toBe(chunk);
    expect(clock.now()).toBeLessThan(500);
  });

  it("stream_set (Codex) : ne diffuse que l'incrément par rapport au texte déjà reçu", () => {
    const clock = makeManualClock();
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    smoother.pushStreamSet("t1", "Début de la");
    smoother.pushStreamSet("t1", "Début de la réponse complète. ");
    let guard = 0;
    while (clock.pending() > 0 && guard < 200) { clock.tick(); guard += 1; }
    expect(applied.join("")).toBe("Début de la réponse complète. ");
  });

  it("resetTo (rattrapage de reconnexion) : pas de replay, texte déjà affiché tel quel", () => {
    const clock = makeManualClock();
    const applied: string[] = [];
    const smoother = new TextStreamSmoother({
      apply: (_tid, text) => applied.push(text),
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    smoother.resetTo("t1", "Texte déjà reçu avant l'ouverture.");
    expect(applied).toEqual([]); // resetTo n'appelle jamais apply : déjà matérialisé ailleurs
    expect(clock.pending()).toBe(0);
    // un stream_set qui continue logiquement ce texte ne redonne QUE la suite
    smoother.pushStreamSet("t1", "Texte déjà reçu avant l'ouverture. Et la suite. ");
    let guard = 0;
    while (clock.pending() > 0 && guard < 200) { clock.tick(); guard += 1; }
    expect(applied.join("")).toBe(" Et la suite. ");
  });
});

describe("TextStreamSmoother — pas de délai artificiel", () => {
  it("un buffer vide ne programme jamais de frame", () => {
    const clock = makeManualClock();
    const smoother = new TextStreamSmoother({
      apply: () => {},
      raf: clock.raf,
      caf: clock.caf,
      isHidden: () => false,
      prefersReducedMotion: () => false,
    });
    smoother.pushDelta("t1", "");
    expect(clock.pending()).toBe(0);
  });
});

describe("intégration matchMedia par défaut", () => {
  it("respecte prefers-reduced-motion via matchMedia quand rien n'est injecté", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    try {
      const applied: string[] = [];
      const smoother = new TextStreamSmoother({ apply: (_tid, text) => applied.push(text) });
      smoother.pushDelta("t1", "Texte immédiat.");
      expect(applied.join("")).toBe("Texte immédiat.");
    } finally {
      window.matchMedia = original;
    }
  });
});
