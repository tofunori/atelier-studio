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

  it("Chat et Gallery partagent le même token de hauteur de header", () => {
    expect(tokens).toContain("--surface-header-height: 44px");
    expect(primitives).toMatch(/\.ui-surface-header\s*\{[\s\S]*?min-height:\s*var\(--surface-header-height\)/);
    expect(appCss).toMatch(/\.atelier-bar\s*\{[\s\S]*?height:\s*var\(--surface-header-height\)/);
  });

  it("les contrôles partagent une géométrie et une bordure interactive communes", () => {
    expect(tokens).toContain("--control-height: 30px");
    expect(tokens).toContain("--control-height-compact: 26px");
    expect(tokens).toContain("--border-interactive:");
    expect(primitives).toMatch(/\.ui-btn\s*\{[\s\S]*?height:\s*var\(--control-height\)/);
    expect(appCss).toMatch(/\.custom-select-trigger\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
    expect(appCss).toMatch(/\.exp-search\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
  });

  it("les tabs Atelier restent compacts et neutres, sans accent de marque", () => {
    expect(appCss).toMatch(/\.sidebar li\.active::before\s*\{[\s\S]*?background:\s*var\(--selection-line\)/);
    expect(primitives).toMatch(/\.ui-tab\s*\{[\s\S]*?height:\s*28px/);
    expect(primitives).toMatch(/\.ui-tab\.is-active::after\s*\{[\s\S]*?background:\s*var\(--border-strong\)/);
    expect(primitives).not.toMatch(/\.ui-tab\.is-active[^}]*var\(--selection-line\)/);
  });

  it("les patterns officiels n'ont plus de seconde implémentation dans App.css", () => {
    for (const legacy of [".atab {", ".jump-pill {", ".tool-group.worklog", ".turn-fold {"]) {
      expect(appCss.includes(legacy), `ancienne implémentation encore présente: ${legacy}`).toBe(false);
    }
    for (const primitive of [".ui-tab {", ".ui-activity {", ".ui-jumpnav {"]) {
      expect(primitives.includes(primitive), `primitive absente: ${primitive}`).toBe(true);
    }
  });

  it("les surfaces interactives partagent les durées Quiet Instrument", () => {
    expect(appCss).toMatch(/\.exp-row, \.pnav-row, \.set-nav-item,[\s\S]*?background-color var\(--motion-fast\) var\(--ease-out\)/);
    expect(appCss).toMatch(/box-shadow var\(--motion-standard\) var\(--ease-out\)/);
    expect(primitives).toMatch(/\.ui-tab-close\s*\{[^}]*opacity:\s*\.42/);
    expect(primitives).toMatch(/\.ui-tab:hover \.ui-tab-close,[\s\S]*?opacity:\s*\.86/);
  });

  it("les iframes Atelier ne révèlent jamais un fond blanc dans leur gouttière", () => {
    expect(appCss).toMatch(/\.atelier\s*\{[\s\S]*?background:\s*var\(--surface-app\);[\s\S]*?color-scheme:\s*dark/);
    expect(appCss).toMatch(/:root\[data-theme="light"\] \.atelier\s*\{\s*color-scheme:\s*light/);
    expect(appCss).not.toMatch(/\.atelier\s*\{[^}]*background:\s*#fff/);
  });

  it("le chrome permanent partage le canvas de l'app dans tous les thèmes", () => {
    expect(tokens).toContain("--surface-panel: var(--surface-app)");
    expect(tokens).toContain("--surface-header: var(--surface-app)");
    expect(appCss).toMatch(/\.sidebar\s*\{[\s\S]*?background:\s*var\(--surface-panel\)/);
    expect(appCss).toMatch(/\.rail\s*\{[\s\S]*?background:\s*var\(--surface-panel\)/);
    expect(appCss).toMatch(/\.topbar\s*\{[\s\S]*?background:\s*var\(--surface-header\)/);
    for (const selector of ["side-fixed", "explorer", "set-nav", "biblio-left", "generateur-form", "pnav-header"]) {
      expect(appCss, `${selector} doit utiliser --surface-panel`).toMatch(
        new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?background:\\s*var\\(--surface-panel\\)`),
      );
    }
    for (const selector of ["surface-bar", "term-bar", "browser-chrome", "browser-bar", "git-head", "git-commit", "biblio-reader-head", "reviewer-bar"]) {
      expect(appCss, `${selector} doit utiliser --surface-header`).toMatch(
        new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?background:\\s*var\\(--surface-header\\)`),
      );
    }
  });

  it("les séparateurs gardent une cible 4 px avec un trait visuel 1 px", () => {
    expect(tokens).toContain("--resize-handle-hit: 4px");
    expect(tokens).toContain("--resize-handle-line: 1px");
    expect(appCss).toMatch(/\.handle\s*\{[\s\S]*?width:\s*var\(--resize-handle-hit\)/);
    expect(appCss).toMatch(/\.handle::after\s*\{[\s\S]*?width:\s*var\(--resize-handle-line\)/);
    expect(appCss).toMatch(/\.pane-divider::after\s*\{[\s\S]*?width:\s*var\(--resize-handle-line\)/);
  });
});
