import { describe, expect, it } from "vitest";
import { sameVirtualRow, stabilizeVirtualRows } from "./virtualRows";

const row = (key: string, item?: Record<string, unknown>, beforeActiveTail?: boolean) =>
  ({ type: item ? "rendered" : "working", key, item, beforeActiveTail } as any);

describe("stabilizeVirtualRows", () => {
  it("réutilise l'objet précédent quand l'item est shallow-égal", () => {
    const ev = { kind: "text", text: "a" };
    const prev = new Map([["k1", row("k1", { type: "event", index: 0, event: ev })]]);
    const [stable] = stabilizeVirtualRows(prev, [row("k1", { type: "event", index: 0, event: ev })]);
    expect(stable).toBe(prev.get("k1"));
  });
  it("rend le nouvel objet quand l'item a changé", () => {
    const prev = new Map([["k1", row("k1", { type: "event", index: 0, event: { text: "a" } })]]);
    const next = row("k1", { type: "event", index: 0, event: { text: "b" } });
    const [stable] = stabilizeVirtualRows(prev, [next]);
    expect(stable).toBe(next);
  });
  it("les rangées sans item se réutilisent sur la clé seule", () => {
    const prev = new Map([["w", row("w")]]);
    const [stable] = stabilizeVirtualRows(prev, [row("w")]);
    expect(stable).toBe(prev.get("w"));
  });
});

describe("sameVirtualRow — beforeActiveTail (marge du tour actif, ex :has())", () => {
  const ev = { kind: "text", text: "a" };
  it("diffère quand seul beforeActiveTail change (item shallow-égal)", () => {
    const a = row("k1", { type: "event", index: 0, event: ev }, false);
    const b = row("k1", { type: "event", index: 0, event: ev }, true);
    expect(sameVirtualRow(a, b)).toBe(false);
  });
  it("identique quand beforeActiveTail et item sont inchangés", () => {
    const a = row("k1", { type: "event", index: 0, event: ev }, true);
    const b = row("k1", { type: "event", index: 0, event: ev }, true);
    expect(sameVirtualRow(a, b)).toBe(true);
  });
  it("un flip invalide le cache dans stabilizeVirtualRows", () => {
    const prev = new Map([["k1", row("k1", { type: "event", index: 0, event: ev }, false)]]);
    const next = row("k1", { type: "event", index: 0, event: ev }, true);
    const [stable] = stabilizeVirtualRows(prev, [next]);
    expect(stable).toBe(next);
  });
});
