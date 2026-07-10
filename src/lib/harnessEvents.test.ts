// Tests purs du reducer harnais (plan 025, step 8) — aucune dépendance DOM :
// on vérifie la structure des listes produites, les invariants turn-scoped et
// LA propriété centrale du plan : replay (materialize) == live (reduce).
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "./ws";
import {
  eventIdentity,
  materializeHarnessHistory,
  mergeHarnessHistory,
  reduceHarnessEvent,
} from "./harnessEvents";
import { FIXED_TS, events, makeMeta, resetFixtureSeq } from "../test/fixtures";

beforeEach(() => resetFixtureSeq());

/** Rejoue une séquence "live", événement par événement. */
function runLive(seq: AgentEvent[], initial: AgentEvent[] = []): AgentEvent[] {
  let out = initial;
  for (const ev of seq) out = reduceHarnessEvent(out, ev);
  return out;
}

const kinds = (list: AgentEvent[]) => list.map((e) => e.kind);
const meta = makeMeta;

describe("reduceHarnessEvent — branches", () => {
  it("user : append, puis l'ack sidecar (même messageId) adopte la meta sans dupliquer ni perdre l'affichage local", () => {
    const optimistic: AgentEvent = {
      kind: "user",
      text: "Analyse ceci.",
      ts: FIXED_TS,
      imageUrl: "data:image/png;base64,xyz",
      meta: { provisional: true, messageId: "m-1" },
    };
    const one = reduceHarnessEvent([], optimistic);
    expect(one).toHaveLength(1);

    const ack: AgentEvent = {
      kind: "user",
      text: "Analyse ceci.",
      meta: meta({ eventId: "e-user-1", messageId: "m-1", sequence: 1 }),
    };
    const two = reduceHarnessEvent(one, ack);
    expect(two).toHaveLength(1);
    expect(two[0].meta).toEqual(ack.meta);
    // l'affichage local (imageUrl) survit à l'adoption de la meta autoritaire
    expect((two[0] as Extract<AgentEvent, { kind: "user" }>).imageUrl).toBe(
      "data:image/png;base64,xyz",
    );
    // un user d'un AUTRE messageId reste une nouvelle bulle
    const three = reduceHarnessEvent(two, {
      kind: "user", text: "Autre question.",
      meta: meta({ eventId: "e-user-2", messageId: "m-2", sequence: 4 }),
    });
    expect(three).toHaveLength(2);
  });

  it("thinking_delta accumule puis thinking final remplace le bloc live", () => {
    const out = runLive([
      { kind: "thinking_delta", text: "je ", meta: meta({ eventId: "t1", sequence: 1 }) },
      { kind: "thinking_delta", text: "réfléchis", meta: meta({ eventId: "t2", sequence: 2 }) },
    ]);
    expect(kinds(out)).toEqual(["thinking_live"]);
    expect((out[0] as Extract<AgentEvent, { kind: "thinking_live" }>).text).toBe("je réfléchis");

    const done = reduceHarnessEvent(out, {
      kind: "thinking", text: "je réfléchis mieux", meta: meta({ eventId: "t3", sequence: 3 }),
    });
    expect(kinds(done)).toEqual(["thinking"]);
    expect((done[0] as Extract<AgentEvent, { kind: "thinking" }>).text).toBe("je réfléchis mieux");
  });

  it("delta crée puis accumule la bulle streaming ; stream_set remplace son texte ; text la finalise", () => {
    let out = runLive([
      { kind: "delta", text: "Bon", meta: meta({ eventId: "d1", sequence: 1 }) },
      { kind: "delta", text: "jour", meta: meta({ eventId: "d2", sequence: 2 }) },
    ]);
    expect(kinds(out)).toEqual(["streaming"]);
    expect((out[0] as Extract<AgentEvent, { kind: "streaming" }>).text).toBe("Bonjour");

    out = reduceHarnessEvent(out, {
      kind: "stream_set", text: "Bonsoir", meta: meta({ eventId: "d3", sequence: 3 }),
    });
    expect((out[0] as Extract<AgentEvent, { kind: "streaming" }>).text).toBe("Bonsoir");

    out = reduceHarnessEvent(out, {
      kind: "text", text: "Bonsoir, Thierry.", ts: FIXED_TS + 500,
      meta: meta({ eventId: "d4", sequence: 4 }),
    });
    expect(kinds(out)).toEqual(["text"]);
  });

  it("text remplace SA bulle streaming même si des events outils se sont intercalés", () => {
    const out = runLive([
      { kind: "delta", text: "Je regarde", meta: meta({ eventId: "s1", sequence: 1 }) },
      { ...events.tool({ id: "call-1" }), meta: meta({ eventId: "s2", sequence: 2, itemId: "call-1" }) },
      { kind: "text", text: "Je regarde les données.", meta: meta({ eventId: "s3", sequence: 3 }) },
    ]);
    expect(kinds(out)).toEqual(["text", "tool_update"]);
  });

  it("tool_update : remplacement en place par (turnId, itemId)", () => {
    const first = { ...events.tool({ id: "call-1", output: "en cours", status: "running" }), meta: meta({ eventId: "u1", sequence: 1, itemId: "call-1" }) };
    const second = { ...events.tool({ id: "call-1", output: "fini", status: "completed" }), meta: meta({ eventId: "u2", sequence: 2, itemId: "call-1" }) };
    const out = runLive([first, second]);
    expect(out).toHaveLength(1);
    expect((out[0] as Extract<AgentEvent, { kind: "tool_update" }>).output).toBe("fini");
  });

  it("activity : remplacement par id ; interaction : remplacement par requestId ; todos : remplace le dernier", () => {
    const out = runLive([
      { kind: "activity", id: "a1", title: "Recherche", status: "running", ts: FIXED_TS },
      { kind: "activity", id: "a1", title: "Recherche", status: "completed", ts: FIXED_TS + 1 },
      { kind: "interaction", requestId: "r1", interactionType: "approval", title: "OK ?", state: "pending", ts: FIXED_TS + 2 },
      { kind: "interaction", requestId: "r1", interactionType: "approval", title: "OK ?", state: "answered", answerSummary: "oui", ts: FIXED_TS + 3 },
      { kind: "todos", items: [{ text: "lire", completed: false }], ts: FIXED_TS + 4 },
      { kind: "todos", items: [{ text: "lire", completed: true }], ts: FIXED_TS + 5 },
    ]);
    expect(kinds(out)).toEqual(["activity", "interaction", "todos"]);
    expect((out[0] as Extract<AgentEvent, { kind: "activity" }>).status).toBe("completed");
    expect((out[1] as Extract<AgentEvent, { kind: "interaction" }>).state).toBe("answered");
    expect((out[2] as Extract<AgentEvent, { kind: "todos" }>).items[0].completed).toBe(true);
  });

  it("done fige une bulle streaming non vide en text (ts de la bulle conservé) ; une bulle vide disparaît", () => {
    const frozen = runLive([
      { kind: "delta", text: "réponse partielle", ts: FIXED_TS + 100 },
      events.done(),
    ]);
    expect(kinds(frozen)).toEqual(["text", "done"]);
    expect((frozen[0] as Extract<AgentEvent, { kind: "text" }>).ts).toBe(FIXED_TS + 100);

    const empty = runLive([
      { kind: "delta", text: "   ", ts: FIXED_TS + 100 },
      events.done(),
    ]);
    expect(kinds(empty)).toEqual(["done"]);
  });

  it("started/heartbeat/usage : no-op strict (même référence)", () => {
    const list = runLive([events.user()]);
    expect(reduceHarnessEvent(list, events.started())).toBe(list);
    expect(reduceHarnessEvent(list, events.heartbeat())).toBe(list);
    expect(reduceHarnessEvent(list, events.usage())).toBe(list);
  });

  it("permission/tool/edit/goal : simple ajout en fin de fil", () => {
    const out = runLive([
      { kind: "permission", requestId: "p1", toolName: "Bash", answered: null, ts: FIXED_TS },
      { kind: "tool", name: "Read" },
      { kind: "edit", files: [{ path: "a.py", add: 3, del: 1 }], ts: FIXED_TS + 1 },
      { kind: "goal", goal: { objective: "finir", status: "active", tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 }, ts: FIXED_TS + 2 },
    ]);
    expect(kinds(out)).toEqual(["permission", "tool", "edit", "goal"]);
  });
});

describe("invariants plan 025 — identités et turns", () => {
  it("collision itemId inter-turn : deux tool_update de même id dans deux turns restent deux items", () => {
    const out = runLive([
      { ...events.tool({ id: "call-1", detail: "premier" }), meta: meta({ eventId: "c1", turnId: "turn-1", itemId: "call-1", sequence: 1 }) },
      { ...events.tool({ id: "call-1", detail: "second" }), meta: meta({ eventId: "c2", turnId: "turn-2", itemId: "call-1", sequence: 5 }) },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((e) => (e as Extract<AgentEvent, { kind: "tool_update" }>).detail))
      .toEqual(["premier", "second"]);
  });

  it("duplicate WS : un meta.eventId déjà vu est ignoré (même référence), y compris pour un delta fusionné", () => {
    const done = { ...events.done(), meta: meta({ eventId: "dup-done", sequence: 3 }) };
    const list = runLive([events.user(), done]);
    expect(reduceHarnessEvent(list, done)).toBe(list);

    // la bulle streaming adopte l'eventId du dernier delta : sa re-livraison
    // (reconnexion) ne double pas le texte
    const delta: AgentEvent = { kind: "delta", text: "abc", meta: meta({ eventId: "dup-delta", sequence: 4 }) };
    const withStream = reduceHarnessEvent(list, delta);
    expect(reduceHarnessEvent(withStream, delta)).toBe(withStream);
  });

  it("streaming turn-scoped : deux turns entrelacés gardent chacun leur bulle", () => {
    const out = runLive([
      { kind: "delta", text: "A1 ", meta: meta({ eventId: "i1", turnId: "turn-1", sequence: 1 }) },
      { kind: "delta", text: "B1 ", meta: meta({ eventId: "i2", turnId: "turn-2", sequence: 2 }) },
      { kind: "delta", text: "A2", meta: meta({ eventId: "i3", turnId: "turn-1", sequence: 3 }) },
      { kind: "delta", text: "B2", meta: meta({ eventId: "i4", turnId: "turn-2", sequence: 4 }) },
    ]);
    expect(kinds(out)).toEqual(["streaming", "streaming"]);
    const texts = out.map((e) => (e as Extract<AgentEvent, { kind: "streaming" }>).text);
    expect(texts).toEqual(["A1 A2", "B1 B2"]);
  });

  it("terminal turn-scoped : done d'un autre turn ne fige pas la bulle ; sans meta, comportement global historique", () => {
    const list = runLive([
      { kind: "delta", text: "en cours", meta: meta({ eventId: "z1", turnId: "turn-1", sequence: 1 }) },
    ]);
    const other = reduceHarnessEvent(list, {
      ...events.done(), meta: meta({ eventId: "z2", turnId: "turn-2", sequence: 2 }),
    });
    expect(kinds(other)).toEqual(["streaming", "done"]);

    const legacy = reduceHarnessEvent(list, events.done());
    expect(kinds(legacy)).toEqual(["text", "done"]);
  });

  it("thinking final turn-scoped : ne remplace pas le thinking_live d'un autre turn", () => {
    const list = runLive([
      { kind: "thinking_delta", text: "turn 1…", meta: meta({ eventId: "y1", turnId: "turn-1", sequence: 1 }) },
    ]);
    const out = reduceHarnessEvent(list, {
      kind: "thinking", text: "conclusion turn 2", meta: meta({ eventId: "y2", turnId: "turn-2", sequence: 2 }),
    });
    expect(kinds(out)).toEqual(["thinking_live", "thinking"]);
  });

  it("out-of-order toléré : un tool_update livré après le done de son turn reste appliqué sans crash", () => {
    const out = runLive([
      { ...events.tool({ id: "call-1", output: "v1" }), meta: meta({ eventId: "o1", itemId: "call-1", sequence: 2 }) },
      { ...events.done(), meta: meta({ eventId: "o2", sequence: 4 }) },
      { ...events.tool({ id: "call-1", output: "v2" }), meta: meta({ eventId: "o3", itemId: "call-1", sequence: 3 }) },
    ]);
    expect(kinds(out)).toEqual(["tool_update", "done"]);
    expect((out[0] as Extract<AgentEvent, { kind: "tool_update" }>).output).toBe("v2");
  });

  it("interruption partielle : error fige la bulle streaming en texte définitif", () => {
    const out = runLive([
      { kind: "delta", text: "réponse coup", meta: meta({ eventId: "x1", sequence: 1 }) },
      { kind: "error", message: "interrompu", meta: meta({ eventId: "x2", sequence: 2 }) },
    ]);
    expect(kinds(out)).toEqual(["text", "error"]);
    expect((out[0] as Extract<AgentEvent, { kind: "text" }>).text).toBe("réponse coup");
  });
});

describe("materializeHarnessHistory — replay = live", () => {
  it("parité : 12 événements joués en live == materialize du même tableau", () => {
    const m = (eventId: string, sequence: number, itemId?: string) =>
      meta({ eventId, sequence, ...(itemId ? { itemId } : {}) });
    const seq: AgentEvent[] = [
      { kind: "user", text: "Question ?", ts: FIXED_TS, meta: m("p1", 1) },
      { kind: "thinking_delta", text: "je ", meta: m("p2", 2) },
      { kind: "thinking_delta", text: "lis", meta: m("p3", 3) },
      { kind: "thinking", text: "je lis le fichier", meta: m("p4", 4) },
      { kind: "delta", text: "Voici ", meta: m("p5", 5) },
      { ...events.tool({ id: "call-1" }), meta: m("p6", 6, "call-1") },
      { kind: "delta", text: "l'analyse", meta: m("p7", 7) },
      { kind: "text", text: "Voici l'analyse complète.", meta: m("p8", 8) },
      { kind: "todos", items: [{ text: "vérifier", completed: false }], meta: m("p9", 9) },
      { kind: "interaction", requestId: "r1", interactionType: "approval", title: "Écrire ?", state: "pending", meta: m("p10", 10) },
      { kind: "interaction", requestId: "r1", interactionType: "approval", title: "Écrire ?", state: "answered", answerSummary: "oui", meta: m("p11", 11) },
      { ...events.done(), meta: m("p12", 12) },
    ];
    const live = runLive(seq);
    const replay = materializeHarnessHistory(seq);
    expect(replay).toEqual(live);
    expect(kinds(live)).toEqual(["user", "thinking", "text", "tool_update", "todos", "interaction", "done"]);
  });

  it("assainit les bulles streaming orphelines : non vide → text, vide → retirée", () => {
    const out = materializeHarnessHistory([
      events.user(),
      { kind: "streaming", text: "réponse orpheline", ts: FIXED_TS + 100 },
      { kind: "streaming", text: "   ", ts: FIXED_TS + 200 },
    ]);
    expect(kinds(out)).toEqual(["user", "text"]);
    expect((out[1] as Extract<AgentEvent, { kind: "text" }>).text).toBe("réponse orpheline");
  });

  it("ancien history sans metadata : pas de crash, identités synthétiques stables et distinctes", () => {
    const legacy: AgentEvent[] = [
      { kind: "user", text: "Vieille question" },
      { kind: "text", text: "Vieille réponse" },
      { kind: "text", text: "Autre réponse" },
      events.done(),
    ];
    const out = materializeHarnessHistory(legacy);
    expect(kinds(out)).toEqual(["user", "text", "text", "done"]);
    for (const ev of legacy) {
      expect(eventIdentity(ev)).toBe(eventIdentity({ ...ev })); // stable par valeur
      expect(eventIdentity(ev)).toMatch(/^legacy:/); // jamais un index
    }
    expect(new Set(legacy.map(eventIdentity)).size).toBe(legacy.length);
  });
});

describe("eventIdentity", () => {
  it("meta : turnId + itemId, ou turnId + eventId sans itemId", () => {
    const withItem: AgentEvent = { ...events.tool({ id: "call-1" }), meta: meta({ eventId: "e1", turnId: "turn-9", itemId: "call-1" }) };
    expect(eventIdentity(withItem)).toBe("turn-9:call-1");
    const noItem: AgentEvent = { kind: "text", text: "fin", meta: meta({ eventId: "e2", turnId: "turn-9", sequence: 2 }) };
    expect(eventIdentity(noItem)).toBe("turn-9:e2");
  });
});

describe("mergeHarnessHistory — history tardif", () => {
  it("fil vide : équivaut à materialize(incoming)", () => {
    const incoming: AgentEvent[] = [
      { kind: "user", text: "Q ?", ts: FIXED_TS, meta: meta({ eventId: "h1", sequence: 1 }) },
      { kind: "text", text: "R.", meta: meta({ eventId: "h2", sequence: 2 }) },
    ];
    expect(mergeHarnessHistory([], incoming)).toEqual(materializeHarnessHistory(incoming));
  });

  it("fil peuplé + incoming sans meta : fusion no-op, même référence (fil vivant jamais écrasé)", () => {
    const current = runLive([events.user("Question initiale ?"), events.text("Réponse initiale.")]);
    const out = mergeHarnessHistory(current, [events.user("Question rechargée ?")]);
    expect(out).toBe(current);
  });

  it("fusionne par eventId/sequence AVANT les événements live plus récents, sans écraser le live", () => {
    // live : turn-2 en cours (user acké + bulle streaming)
    const current = runLive([
      { kind: "user", text: "Question 2 ?", ts: FIXED_TS + 1000, meta: meta({ eventId: "e10", turnId: "turn-2", sequence: 10 }) },
      { kind: "delta", text: "Réponse 2 en cours", meta: meta({ eventId: "e11", turnId: "turn-2", sequence: 11 }) },
    ]);
    // history tardif : tout le turn-1 + un duplicate du user live
    const incoming: AgentEvent[] = [
      { kind: "user", text: "Question 1 ?", ts: FIXED_TS, meta: meta({ eventId: "e1", turnId: "turn-1", sequence: 1 }) },
      { kind: "text", text: "Réponse 1.", ts: FIXED_TS + 2, meta: meta({ eventId: "e2", turnId: "turn-1", sequence: 2 }) },
      { ...events.done(), meta: meta({ eventId: "e3", turnId: "turn-1", sequence: 3 }) },
      { kind: "user", text: "Question 2 ?", ts: FIXED_TS + 1000, meta: meta({ eventId: "e10", turnId: "turn-2", sequence: 10 }) },
    ];
    const out = mergeHarnessHistory(current, incoming);
    expect(kinds(out)).toEqual(["user", "text", "done", "user", "streaming"]);
    // le turn-1 manquant est inséré AVANT le live, ordonné par sequence
    expect((out[0] as Extract<AgentEvent, { kind: "user" }>).text).toBe("Question 1 ?");
    // le live est conservé tel quel : bulle streaming intacte, pas de doublon e10
    expect((out[4] as Extract<AgentEvent, { kind: "streaming" }>).text).toBe("Réponse 2 en cours");
    expect(out.filter((e) => e.kind === "user")).toHaveLength(2);
    // le done historique du turn-1 n'a PAS figé la bulle streaming du turn-2
    expect(out[4].kind).toBe("streaming");
  });

  it("un événement manquant plus ancien ne remplace pas l'état live plus récent du même item", () => {
    const liveTool = { ...events.tool({ id: "call-1", output: "état final live" }), meta: meta({ eventId: "l2", itemId: "call-1", sequence: 6 }) };
    const current = runLive([liveTool]);
    const staleTool = { ...events.tool({ id: "call-1", output: "état intermédiaire" }), meta: meta({ eventId: "l1", itemId: "call-1", sequence: 5 }) };
    const out = mergeHarnessHistory(current, [staleTool]);
    expect(out).toHaveLength(1);
    expect((out[0] as Extract<AgentEvent, { kind: "tool_update" }>).output).toBe("état final live");
  });
});
