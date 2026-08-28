// Non-régression : un bloc de code en croissance pendant le stream produit
// une clé `lang+raw` neuve à chaque frame. Sans le paramètre `transient`,
// chaque frame insérerait une entrée dans le cache LRU (300 entrées) et
// évincerait l'historique déjà coloré. `transient: true` doit lire le cache
// (hit toujours honoré) sans jamais y écrire.
import { describe, expect, it } from "vitest";
import { highlightCache, highlightCode } from "./md";

describe("highlightCode — option transient", () => {
  it("n'insère rien dans le cache quand transient est vrai", () => {
    const before = highlightCache.size;
    highlightCode("print('frame unique')", "python", { transient: true });
    expect(highlightCache.size).toBe(before);
  });

  it("insère toujours dans le cache par défaut (comportement non-streaming inchangé)", () => {
    const before = highlightCache.size;
    highlightCode("print('bloc final unique')", "python");
    expect(highlightCache.size).toBe(before + 1);
  });

  it("un appel transient sert quand même un hit déjà en cache", () => {
    const raw = "x = 1";
    const cached = highlightCode(raw, "python"); // insère (non transient)
    const hit = highlightCode(raw, "python", { transient: true });
    expect(hit).toBe(cached);
  });
});
