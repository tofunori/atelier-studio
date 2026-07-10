// Contrat CSS exécutable (plan 016) — jsdom ne calcule pas la cascade, donc
// les invariants Quiet Instrument sont vérifiés sur les SOURCES :
// - plus aucun `transition: all` dans src/ ;
// - budget : une seule @keyframes dans primitives.css (le spinner) ;
// - reduced motion : les trois tokens de durée passent à 0 ms centralement ;
// - primitives.css n'introduit AUCUNE durée en ms hors tokens (plafond 150 ms
//   garanti par construction).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..", "..");
// le contrat porte sur les RÈGLES, pas sur les commentaires qui les citent
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = stripComments(readFileSync(join(root, "styles", "tokens.css"), "utf8"));
const primitives = stripComments(readFileSync(join(root, "styles", "primitives.css"), "utf8"));
const appCss = stripComments(readFileSync(join(root, "App.css"), "utf8"));

describe("contrat Quiet Instrument (sources CSS)", () => {
  it("aucun `transition: all` dans tokens/primitives/App.css", () => {
    for (const [name, css] of [
      ["tokens.css", tokens],
      ["primitives.css", primitives],
      ["App.css", appCss],
    ] as const) {
      expect(css.includes("transition: all"), `transition: all trouvé dans ${name}`).toBe(false);
      expect(css.includes("transition:all"), `transition:all trouvé dans ${name}`).toBe(false);
    }
  });

  it("budget d'animation : primitives.css définit exactement une @keyframes (spinner)", () => {
    const keyframes = primitives.match(/@keyframes\s+([\w-]+)/g) ?? [];
    expect(keyframes).toEqual(["@keyframes ui-spin"]);
  });

  it("reduced motion : les tokens de durée sont neutralisés centralement (0ms)", () => {
    const block = tokens.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    for (const v of ["--motion-fast: 0ms", "--motion-standard: 0ms", "--motion-panel: 0ms"]) {
      expect(block![0]).toContain(v);
    }
  });

  it("primitives.css : aucune durée en ms hors tokens ; plafond 150 ms par construction", () => {
    // toute durée doit passer par var(--motion-*) / var(--tooltip-delay)
    const rawMs = primitives.match(/\b\d+(\.\d+)?ms\b/g) ?? [];
    expect(rawMs, `durées ms en dur dans primitives.css : ${rawMs.join(", ")}`).toEqual([]);
    // seule durée en secondes tolérée : la rotation du spinner (continue, pas
    // une transition d'état)
    const rawS = primitives.match(/\b\d+(\.\d+)?s\b/g) ?? [];
    expect(rawS).toEqual(["0.9s"]);
  });

  it("tokens : les durées déclarées respectent le plafond 120/140/150 et le délai tooltip 400–450", () => {
    expect(tokens).toContain("--motion-fast: 120ms");
    expect(tokens).toContain("--motion-standard: 140ms");
    expect(tokens).toContain("--motion-panel: 150ms");
    const delay = Number(tokens.match(/--tooltip-delay: (\d+)ms/)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(400);
    expect(delay).toBeLessThanOrEqual(450);
  });

  it("primitives.css : z-index uniquement via l'échelle --z-*", () => {
    const zLines = primitives.match(/z-index:[^;]+;/g) ?? [];
    for (const line of zLines) {
      expect(line, `z-index en dur : ${line}`).toMatch(/z-index:\s*var\(--z-[a-z]+\);/);
    }
  });

  it("primitives.css : aucune transition de géométrie (width/height/padding/margin)", () => {
    const transitions = primitives.match(/transition:[^;]+;/g) ?? [];
    for (const line of transitions) {
      expect(line).not.toMatch(/\b(width|height|padding|margin|top|left|right|bottom)\b/);
    }
  });
});
