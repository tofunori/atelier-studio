import { describe, it, expect } from "vitest";
import {
  hashMermaidSource,
  mermaidThemeSignature,
  buildMermaidThemeVariables,
  mermaidSvgCache,
  mermaidCacheKey,
  containsMermaidErrorIcon,
} from "../src/components/MermaidBlock.tsx";

describe("hashMermaidSource", () => {
  it("est stable : même source => même hash", () => {
    const source = "graph TD;\n  a-->b;";
    expect(hashMermaidSource(source)).toBe(hashMermaidSource(source));
  });

  it("hash différent pour un source différent", () => {
    expect(hashMermaidSource("graph TD; a-->b;")).not.toBe(hashMermaidSource("graph TD; a-->c;"));
  });

  it("format hex 8 caractères (jamais Math.random ni compteur)", () => {
    expect(hashMermaidSource("graph TD; a-->b;")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("chaîne vide produit un hash défini (pas d'exception)", () => {
    expect(hashMermaidSource("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("mermaidThemeSignature", () => {
  it("concatène les tokens résolus dans un ordre stable", () => {
    const resolveToken = (name) => `val(${name})`;
    const sig = mermaidThemeSignature(resolveToken);
    expect(sig).toBe("val(--bg-side)|val(--fg2)|val(--muted)|val(--border)|val(--border2)|val(--accent)");
  });

  it("deux resolveToken identiques => même signature", () => {
    const resolveToken = (name) => `#${name.length}`;
    expect(mermaidThemeSignature(resolveToken)).toBe(mermaidThemeSignature(resolveToken));
  });

  it("un token qui change => signature différente (déclenche la ré-init mermaid)", () => {
    const dark = (name) => (name === "--bg-side" ? "#111" : `other(${name})`);
    const light = (name) => (name === "--bg-side" ? "#fff" : `other(${name})`);
    expect(mermaidThemeSignature(dark)).not.toBe(mermaidThemeSignature(light));
  });

  it("trim les valeurs (getComputedStyle renvoie souvent des espaces)", () => {
    const resolveToken = () => "  #222222  ";
    const sig = mermaidThemeSignature(resolveToken);
    expect(sig).not.toMatch(/\s/);
  });
});

describe("buildMermaidThemeVariables", () => {
  const resolveToken = (name) =>
    ({
      "--bg-side": "#1a1d22",
      "--fg2": "#b6bdc7",
      "--muted": "#868d9a",
      "--border": "#333a45",
      "--border2": "#3a414d",
      "--accent": "#e8823a",
    })[name] ?? "";

  it("n'invente aucune couleur : tout vient de resolveToken", () => {
    const vars = buildMermaidThemeVariables(resolveToken);
    // toutes les valeurs renvoyées doivent être l'une des 6 couleurs injectées
    // (ou "inherit", seul cas non-token : fontFamily)
    const allowed = new Set([
      resolveToken("--bg-side"),
      resolveToken("--fg2"),
      resolveToken("--muted"),
      resolveToken("--border"),
      resolveToken("--border2"),
      resolveToken("--accent"),
      "inherit",
    ]);
    for (const [key, value] of Object.entries(vars)) {
      expect(allowed.has(value), `${key}="${value}" doit venir de resolveToken`).toBe(true);
    }
  });

  it("mappe le fond sur --bg-side (palette sobre)", () => {
    const vars = buildMermaidThemeVariables(resolveToken);
    expect(vars.background).toBe("#1a1d22");
    expect(vars.mainBkg).toBe("#1a1d22");
  });

  it("mappe le texte principal sur --fg2 et les traits sur --muted", () => {
    const vars = buildMermaidThemeVariables(resolveToken);
    expect(vars.textColor).toBe("#b6bdc7");
    expect(vars.lineColor).toBe("#868d9a");
  });

  it("n'utilise l'accent qu'avec parcimonie (activation/critical/today)", () => {
    const vars = buildMermaidThemeVariables(resolveToken);
    expect(vars.activationBorderColor).toBe("#e8823a");
    expect(vars.primaryColor).not.toBe("#e8823a");
  });
});

describe("mermaidCacheKey", () => {
  it("combine hash(source) et signature de thème", () => {
    const key = mermaidCacheKey("graph TD; a-->b;", "sig-1");
    expect(key).toBe(`${hashMermaidSource("graph TD; a-->b;")}:sig-1`);
  });

  it("même source, thème différent => clé différente (re-render requis)", () => {
    const a = mermaidCacheKey("graph TD; a-->b;", "light");
    const b = mermaidCacheKey("graph TD; a-->b;", "dark");
    expect(a).not.toBe(b);
  });

  it("source différente, même thème => clé différente", () => {
    const a = mermaidCacheKey("graph TD; a-->b;", "sig");
    const b = mermaidCacheKey("graph TD; a-->c;", "sig");
    expect(a).not.toBe(b);
  });
});

describe("mermaidSvgCache (cache module-level, cap 50, éviction LRU)", () => {
  it("un set() suivi d'un get() sur la même clé renvoie le svg mis en cache", () => {
    const key = mermaidCacheKey("graph TD; x-->y;", "test-sig");
    mermaidSvgCache.set(key, "<svg>x</svg>");
    expect(mermaidSvgCache.get(key)).toBe("<svg>x</svg>");
  });

  it("cap 50 : au-delà, évince l'entrée la plus ancienne (jamais de fuite mémoire)", () => {
    for (let i = 0; i < 60; i++) {
      mermaidSvgCache.set(`evict-key-${i}`, `<svg>${i}</svg>`);
    }
    expect(mermaidSvgCache.size).toBeLessThanOrEqual(50);
    expect(mermaidSvgCache.get("evict-key-0")).toBeUndefined();
    expect(mermaidSvgCache.get("evict-key-59")).toBe("<svg>59</svg>");
  });
});

describe("containsMermaidErrorIcon", () => {
  it("détecte la classe error-icon (diagramme qui a 'réussi' à dessiner l'erreur)", () => {
    const svg = '<svg><g class="error-icon"><path/></g></svg>';
    expect(containsMermaidErrorIcon(svg)).toBe(true);
  });

  it("détecte error-icon parmi plusieurs classes sur l'élément", () => {
    const svg = '<svg><g class="node error-icon foo"><path/></g></svg>';
    expect(containsMermaidErrorIcon(svg)).toBe(true);
  });

  it("un svg valide sans error-icon n'est pas signalé", () => {
    const svg = '<svg><g class="node default"><path/></g></svg>';
    expect(containsMermaidErrorIcon(svg)).toBe(false);
  });

  it("ne fait pas de faux positif sur une classe qui contient juste le mot (ex. not-error-icon-like)", () => {
    // le mot complet "error-icon" doit apparaître comme classe entière (limite de mot),
    // pas seulement en sous-chaîne d'une autre classe.
    const svg = '<svg><g class="not-error-icon-like"><path/></g></svg>';
    expect(containsMermaidErrorIcon(svg)).toBe(false);
  });
});
