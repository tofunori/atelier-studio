import { describe, expect, it, vi } from "vitest";
import { createThreadEventStore } from "./threadEventStore";
import { mergeHarnessHistory, reduceHarnessEvent } from "./harnessEvents";

describe("thread event transactions", () => {
  it("back-to-back updates and synchronous refs cannot lose a fragment", () => {
    const store = createThreadEventStore();
    for (const text of ["avant de", " lancer", " l’ensemble."]) store.update(p => ({ ...p, a: reduceHarnessEvent(p.a ?? [], { kind: "delta", text }) }));
    expect(store.ref.current.a).toEqual([expect.objectContaining({ text: "avant de lancer l’ensemble." })]);
    expect(store.getSnapshot()).toBe(store.ref.current);
  });
  it("no-op updates preserve snapshot identity and do not notify", () => {
    const store = createThreadEventStore({ a: [] });
    const listener = vi.fn(); store.subscribe("a", listener); store.subscribeAll(listener);
    const snapshot = store.getSnapshot();
    store.update(p => p); store.update(p => ({ ...p }));
    expect(store.getSnapshot()).toBe(snapshot); expect(listener).not.toHaveBeenCalled();
  });
  it("one multi-thread transaction is complete before any subscriber runs", () => {
    const store = createThreadEventStore({ a: [], b: [] });
    const snapshots: unknown[] = [];
    const listener = () => snapshots.push(store.getSnapshot());
    store.subscribe("a", listener); store.subscribe("b", listener); store.subscribeAll(listener);
    const next = { a: [{ kind: "text" as const, text: "a" }], b: [{ kind: "text" as const, text: "b" }] };
    store.update(next); expect(snapshots).toEqual([next]);
  });
  it("history replay and revert use the current snapshot and preserve another thread", () => {
    const store = createThreadEventStore({ a: [{ kind: "user", text: "question" }], b: [{ kind: "text", text: "b" }] });
    const sibling = store.getThread("b");
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "réponse" }) }));
    store.update(p => ({ ...p, a: mergeHarnessHistory(p.a, [{ kind: "user", text: "old" }]) }));
    expect(store.getThread("a")).toHaveLength(2);
    store.update(p => ({ ...p, a: p.a.slice(0, 1) }));
    expect(store.getThread("a")).toEqual([{ kind: "user", text: "question" }]);
    expect(store.getThread("b")).toBe(sibling);
  });
});

// Canal vivant (banc chat_stream_bench, 2026-09-15) : un delta qui ne fait
// que faire grandir la dernière bulle (`streaming` / `thinking_live`) ne
// republie pas la liste — `Chat`, la timeline et la liste virtuelle gardent
// leur instantané, seule la bulle abonnée au canal live se re-rend.
describe("canal vivant : un delta de queue ne republie pas la liste", () => {
  it("garde l'instantané committed et ne notifie que les abonnés live", () => {
    const store = createThreadEventStore({ a: [{ kind: "user", text: "q" }] });
    const timeline = vi.fn(); const home = vi.fn(); const live = vi.fn();
    store.subscribe("a", timeline); store.subscribeAll(home); store.subscribeLive("a", live);
    // 1er delta : la bulle streaming APPARAÎT — changement structurel
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "Je " }) }));
    expect(timeline).toHaveBeenCalledTimes(1); expect(home).toHaveBeenCalledTimes(1); expect(live).toHaveBeenCalledTimes(1);
    const committed = store.getCommitted("a");
    expect(committed).toBe(store.getThread("a"));
    // deltas suivants : seule la queue grandit — live seulement
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "regarde" }) }));
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: " la carte." }) }));
    expect(timeline).toHaveBeenCalledTimes(1); expect(home).toHaveBeenCalledTimes(1);
    expect(live).toHaveBeenCalledTimes(3);
    expect(store.getCommitted("a")).toBe(committed);
    expect(store.getCommittedSnapshot().a).toBe(committed);
    // la vérité complète reste lisible par tout le monde
    expect(store.getThread("a")[1]).toMatchObject({ kind: "streaming", text: "Je regarde la carte." });
    expect(store.liveText("a", "streaming")).toBe("Je regarde la carte.");
    // fin du tour : le texte final remplace la bulle — structurel, tout le monde
    store.update(p => ({ ...p, a: reduceHarnessEvent(reduceHarnessEvent(p.a, { kind: "text", text: "Je regarde la carte." }), { kind: "done", ok: true, result: "" }) }));
    expect(timeline).toHaveBeenCalledTimes(2); expect(home).toHaveBeenCalledTimes(2);
    expect(store.getCommitted("a")).toBe(store.getThread("a"));
    expect(store.getCommitted("a").map(e => e.kind)).toEqual(["user", "text", "done"]);
  });
  it("la pensée vivante grandit en live ; la première bulle texte est structurelle ; puis le texte grandit en live", () => {
    const store = createThreadEventStore({ a: [{ kind: "user", text: "q" }] });
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "thinking_delta", text: "Hmm" }) }));
    const timeline = vi.fn(); store.subscribe("a", timeline);
    const thinking = store.getCommitted("a");
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "thinking_delta", text: ", enfin" }) }));
    expect(timeline).not.toHaveBeenCalled();
    expect(store.getCommitted("a")).toBe(thinking);
    expect(store.liveText("a", "thinking_live")).toBe("Hmm, enfin");
    // la bulle texte apparaît : structurel
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "Oui" }) }));
    expect(timeline).toHaveBeenCalledTimes(1);
    const both = store.getCommitted("a");
    expect(both.map(e => e.kind)).toEqual(["user", "thinking_live", "streaming"]);
    // puis elle grandit : live seulement, la pensée reste lisible derrière
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: " et non." }) }));
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(store.getCommitted("a")).toBe(both);
    expect(store.liveText("a", "streaming")).toBe("Oui et non.");
    expect(store.liveText("a", "thinking_live")).toBe("Hmm, enfin");
  });
  it("tout autre changement (rejeu, retrait, autre fil) est structurel", () => {
    const store = createThreadEventStore({ a: [{ kind: "user", text: "q" }], b: [] });
    store.update(p => ({ ...p, a: reduceHarnessEvent(p.a, { kind: "delta", text: "x" }) }));
    const timeline = vi.fn(); store.subscribe("a", timeline);
    store.update(p => ({ ...p, a: p.a.slice(0, 1) }));           // retrait (revert)
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(store.getCommitted("a")).toHaveLength(1);
    const b = vi.fn(); store.subscribe("b", b);
    store.update(p => ({ ...p, b: [{ kind: "text", text: "b" }] }));
    expect(b).toHaveBeenCalledTimes(1); expect(timeline).toHaveBeenCalledTimes(1);
    store.update(p => { const { a: _a, ...rest } = p; return rest; }); // fil évincé
    expect(timeline).toHaveBeenCalledTimes(2);
    expect(store.getCommitted("a")).toEqual([]);
  });
});

