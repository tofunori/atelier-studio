import { describe, it, expect, vi } from "vitest";
import {
  normalizeMathDelimiters,
  hardenPartialMarkdown,
} from "../src/lib/markdown.ts";
import { LruCache } from "../src/lib/lruCache.ts";

describe("normalizeMathDelimiters", () => {
  it("convertit \\(...\\) en $...$", () => {
    expect(normalizeMathDelimiters("Soit \\(x\\) un scalaire.")).toBe("Soit $x$ un scalaire.");
  });

  it("convertit \\[...\\] en $$...$$", () => {
    expect(normalizeMathDelimiters("\\[y = x^2\\]")).toBe("$$y = x^2$$");
  });

  it("laisse un fence de code intact (jamais transformé)", () => {
    const text = "avant\n```\n\\(x\\) et \\[y\\]\n```\naprès";
    expect(normalizeMathDelimiters(text)).toBe(text);
  });

  it("laisse un inline code intact (jamais transformé)", () => {
    const text = "voir `\\(x\\)` dans le code";
    expect(normalizeMathDelimiters(text)).toBe(text);
  });

  it("mélange prose + fence + inline code : seule la prose est transformée", () => {
    const input = "Soit \\(a\\) puis `code \\(b\\) code` puis :\n```\n\\(c\\)\n```\nfin \\(d\\).";
    const expected = "Soit $a$ puis `code \\(b\\) code` puis :\n```\n\\(c\\)\n```\nfin $d$.";
    expect(normalizeMathDelimiters(input)).toBe(expected);
  });

  it("texte sans math reste intact", () => {
    const text = "Rien à transformer ici, juste du texte normal.";
    expect(normalizeMathDelimiters(text)).toBe(text);
  });

  it("chaîne vide inchangée", () => {
    expect(normalizeMathDelimiters("")).toBe("");
  });
});

describe("hardenPartialMarkdown", () => {
  it("ferme un fence resté ouvert seul", () => {
    const text = "voici du code:\n```python\ndef f():\n    pass";
    expect(hardenPartialMarkdown(text)).toBe(text + "\n```");
  });

  it("laisse un fence déjà pairé intact", () => {
    const text = "avant\n```js\nconst x = 1;\n```\naprès";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("ferme un backtick inline resté impair", () => {
    const text = "valeur `x en cours";
    expect(hardenPartialMarkdown(text)).toBe(text + "`");
  });

  it("nettoie un lien pendant en fin de texte (retire la syntaxe, garde le label)", () => {
    const text = "Regarde [ce lien](https://example.com/chemin-partiel";
    expect(hardenPartialMarkdown(text)).toBe("Regarde ce lien");
  });

  it("nettoie un lien pendant sans aucune URL encore tapée", () => {
    const text = "Voir [texte](";
    expect(hardenPartialMarkdown(text)).toBe("Voir texte");
  });

  it("laisse un lien complet intact (même suivi de texte)", () => {
    const text = "Voir [lien](https://example.com) pour plus.";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("laisse un lien pendant en MILIEU de texte tel quel (autre texte après)", () => {
    const text = "Voir [lien](http://exemple ensuite plein de texte après.";
    expect(hardenPartialMarkdown(text)).toBe(text);
  });

  it("chaîne vide inchangée", () => {
    expect(hardenPartialMarkdown("")).toBe("");
  });
});

describe("LruCache (cache module-level derrière highlightCode)", () => {
  it("une seule invocation pour la même clé (raw,lang)", () => {
    const cache = new LruCache(300);
    const compute = vi.fn((raw, lang) => `${lang}:${raw}`);
    const get = (raw, lang) => {
      const key = `${lang} ${raw}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const value = compute(raw, lang);
      cache.set(key, value);
      return value;
    };

    expect(get("const x=1", "javascript")).toBe("javascript:const x=1");
    expect(get("const x=1", "javascript")).toBe("javascript:const x=1");
    expect(get("const x=1", "javascript")).toBe("javascript:const x=1");
    expect(compute).toHaveBeenCalledTimes(1);

    // une clé différente déclenche un nouveau calcul
    expect(get("const y=2", "javascript")).toBe("javascript:const y=2");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("évince l'entrée la plus ancienne au-delà de la capacité", () => {
    const cache = new LruCache(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // dépasse la capacité (2) -> évince "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("un get() ravive une entrée : elle n'est plus la plus ancienne", () => {
    const cache = new LruCache(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // "a" redevient la plus récente, "b" devient la plus ancienne
    cache.set("c", 3); // évince "b", pas "a"
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});
