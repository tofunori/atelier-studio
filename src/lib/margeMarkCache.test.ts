import { describe, expect, it } from "vitest";
import { createMarkIndexCache } from "./marge";

const ev = (text: string) => ({ kind: "text", text }) as any;

describe("createMarkIndexCache", () => {
  it("résout puis sert du cache tant que l'événement porte encore le passage", () => {
    const cache = createMarkIndexCache();
    const events = [ev("bonjour"), ev("le névé sale")];
    expect(cache.resolve(events, "névé")).toBe(1);
    expect(cache.resolve(events, "névé")).toBe(1); // hit
  });
  it("un passage introuvable est re-cherché seulement dans le nouveau texte", () => {
    const cache = createMarkIndexCache();
    const events = [ev("a"), ev("b")];
    expect(cache.resolve(events, "zzz")).toBe(-1);
    // le passage apparaît dans un événement AJOUTÉ ensuite
    expect(cache.resolve([...events, ev("zzz enfin")], "zzz")).toBe(2);
  });
  it("le dernier événement (potentiellement en croissance) est toujours re-scanné", () => {
    const cache = createMarkIndexCache();
    const growing = [ev("a"), ev("début…")];
    expect(cache.resolve(growing, "fin")).toBe(-1);
    expect(cache.resolve([ev("a"), ev("début… fin")], "fin")).toBe(1);
  });
  it("reset vide tout (changement de fil)", () => {
    const cache = createMarkIndexCache();
    expect(cache.resolve([ev("x")], "x")).toBe(0);
    cache.reset();
    expect(cache.resolve([ev("y")], "x")).toBe(-1);
  });
});
