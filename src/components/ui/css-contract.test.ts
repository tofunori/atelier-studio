// Contrat CSS exécutable (plan 016) — jsdom ne calcule pas la cascade, donc
// les invariants Quiet Instrument sont vérifiés sur les SOURCES :
// - plus aucun `transition: all` dans src/ ;
// - budget : une seule @keyframes dans primitives.css (le spinner) ;
// - reduced motion : les trois tokens de durée passent à 0 ms centralement ;
// - primitives.css n'introduit AUCUNE durée en ms hors tokens (plafond 150 ms
//   garanti par construction).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..", "..");
// le contrat porte sur les RÈGLES, pas sur les commentaires qui les citent
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = stripComments(readFileSync(join(root, "styles", "tokens.css"), "utf8"));
const primitives = stripComments(readFileSync(join(root, "styles", "primitives.css"), "utf8"));
const shadcn = stripComments(readFileSync(join(root, "styles", "shadcn.css"), "utf8"));
const shadcnButton = readFileSync(join(root, "components", "shadcn", "button.tsx"), "utf8");
const shadcnDialog = readFileSync(join(root, "components", "shadcn", "dialog.tsx"), "utf8");
const shadcnDir = join(root, "components", "shadcn");
const shadcnSources = readdirSync(shadcnDir)
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
  .map((file) => [file, readFileSync(join(shadcnDir, file), "utf8")] as const);
const appCss = stripComments(readFileSync(join(root, "App.css"), "utf8"));
const galleryMain = readFileSync(join(root, "..", "gallery", "react-ui", "main.tsx"), "utf8");
const galleryStyles = readFileSync(join(root, "..", "gallery", "react-ui", "styles.css"), "utf8");

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
    expect(shadcnButton).not.toContain("tw:transition-all");
    expect(shadcnButton).not.toContain("tw:dark:");
  });

  it("les sources générées restent compatibles avec les contrats Atelier", () => {
    for (const [name, source] of shadcnSources) {
      expect(source, `${name} contient une variante dark manuelle`).not.toContain("tw:dark:");
      expect(source, `${name} contient un z-index local`).not.toMatch(/tw:z-\d+/);
      expect(source, `${name} contient transition-all`).not.toContain("tw:transition-all");
      expect(source, `${name} contient un token vide généré`).not.toContain("tw: tw:");
      expect(source, `${name} utilise un espacement space-x/space-y`).not.toMatch(/tw:space-[xy]-/);
      expect(source, `${name} contient un séparateur HTML brut`).not.toContain("<hr");
    }
    expect(shadcn).toContain("--motion-fast");
    expect(shadcn).toContain("prefers-reduced-motion: reduce");
  });

  it("les primitives ne réintroduisent aucune valeur hors système (tailles/rayons/ombres/couleurs)", () => {
    for (const [name, source] of shadcnSources) {
      // tailles de texte : uniquement l'échelle 10/11/12/13/15 via tokens —
      // ni littéral px/rem, ni cran Tailwind non snappé par le pont
      expect(source, `${name} : taille de texte littérale hors tokens`).not.toMatch(
        /tw:text-\[[\d.]+(px|rem)\]/,
      );
      expect(source, `${name} : cran de texte Tailwind non snappé (base et +)`).not.toMatch(
        /tw:text-(base|lg|xl|2xl|3xl)\b/,
      );
      // rayons : 6/10/999 uniquement — aucun px littéral dans rounded-[...]
      expect(source, `${name} : rayon littéral hors système`).not.toMatch(
        /tw:rounded(-[a-z]+)?-\[[^\]]*\d+px[^\]]*\]/,
      );
      // profondeur : ombre uniquement via le token d'élévation
      expect(source, `${name} : preset d'ombre Tailwind au lieu de --elevation-overlay`).not.toMatch(
        /tw:shadow-(2xs|xs|sm|md|lg|xl|2xl)\b/,
      );
      // voile de modale : token --scrim, jamais une couleur brute
      expect(source, `${name} : couleur brute black/white`).not.toMatch(/tw:bg-(black|white)\b/);
    }
  });

  it("aucun <button> nu hors ui/ et shadcn/ — Button, IconButton ou RowButton", () => {
    // le contrat bouton est TOTAL : toute surface activable passe par les
    // wrappers (action → Button/IconButton ; rangée/cellule/chip/trigger
    // cloné → RowButton, qui transmet ref et attributs natifs)
    const stripTsx = (code: string) =>
      code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (p.endsWith(join("components", "ui")) || p.endsWith(join("components", "shadcn"))) continue;
          walk(p);
        } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
          if (stripTsx(readFileSync(p, "utf8")).includes("<button")) offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders, `<button> nu dans : ${offenders.join(", ")}`).toEqual([]);
  });

  it("le pont snappe les échelles Tailwind sur le système (rayons 6/10, texte 12/13)", () => {
    expect(shadcn).toContain("--radius-sm: var(--radius-control)");
    expect(shadcn).toContain("--radius-md: var(--radius-control)");
    expect(shadcn).toContain("--radius-lg: var(--radius-surface)");
    expect(shadcn).toContain("--radius-xl: var(--radius-surface)");
    expect(shadcn).toContain("--text-xs: var(--fs-body-s)");
    expect(shadcn).toContain("--text-sm: var(--fs-body)");
  });

  it("la couche shadcn ne contient que des primitives de registre", () => {
    expect(readdirSync(shadcnDir)).not.toContain("dialog-surface.tsx");
    expect(readdirSync(shadcnDir)).not.toContain("dropdown-menu-surface.tsx");
    for (const primitive of ["field.tsx", "radio-group.tsx", "sidebar.tsx"]) {
      expect(readdirSync(shadcnDir)).toContain(primitive);
    }
  });

  it("l'inventaire final ne contient aucune primitive installée au cas où", () => {
    expect(shadcnSources.map(([name]) => name).sort()).toEqual([
      "alert-dialog.tsx", "alert.tsx", "attachment.tsx", "badge.tsx",
      "bubble.tsx", "button-group.tsx", "button.tsx", "checkbox.tsx",
      "collapsible.tsx", "command.tsx", "context-menu.tsx", "dialog.tsx",
      "dropdown-menu.tsx", "empty.tsx", "field.tsx", "input-group.tsx",
      "input.tsx", "kbd.tsx",
      "message.tsx", "popover.tsx", "progress.tsx", "radio-group.tsx",
      "scroll-area.tsx", "select.tsx", "separator.tsx", "sidebar.tsx",
      "skeleton.tsx", "slider.tsx", "sonner.tsx", "spinner.tsx",
      "switch.tsx", "table.tsx", "tabs.tsx", "textarea.tsx", "toggle-group.tsx",
      "toggle.tsx", "tooltip.tsx",
    ]);
  });

  it("les primitives bouton sans Preflight neutralisent le chrome WebKit natif", () => {
    const sources = Object.fromEntries(shadcnSources);
    expect(sources["tabs.tsx"]).toContain("tw:appearance-none");
    expect(sources["tabs.tsx"]).toContain("tw:border-0 tw:bg-transparent tw:p-0");
    expect(sources["button.tsx"]).toMatch(/ghost:\s*\n?\s*"[^"]*tw:bg-transparent/);
    expect(sources["button.tsx"]).toMatch(/link:\s*"[^"]*tw:bg-transparent/);
  });

  it("le chrome Galerie délègue le stacking aux primitives partagées", () => {
    expect(galleryMain).not.toContain('type="search"');
    expect(galleryMain).not.toMatch(/tw:z-(?:\d+|\[[^v][^\]]*\])/);
    expect(galleryMain).toContain('components/ui/Tooltip');
    expect(galleryMain).toContain('layer={modal ? "modal" : "panel"}');
    expect(galleryStyles).toContain('@source "./main.tsx"');
    expect(galleryStyles).not.toContain('@source "./**/*.{ts,tsx}"');
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
    expect(appCss).toMatch(/\.atelier-bar\s*\{[\s\S]*?flex-direction:\s*row/);
  });

  it("les contrôles partagent une géométrie et une bordure interactive communes", () => {
    expect(tokens).toContain("--control-height: 30px");
    expect(tokens).toContain("--control-height-compact: 26px");
    expect(tokens).toContain("--border-interactive:");
    expect(shadcn).toContain("--color-background: var(--background)");
    expect(shadcn).toContain("--color-ring: var(--ring)");
    expect(shadcnButton).toContain("tw:rounded-[var(--radius-control)]");
    expect(shadcnButton).toContain("tw:duration-[var(--motion-fast)]");
    expect(shadcnButton).toContain('ghost:\n          "tw:bg-transparent');
    expect(shadcnSources.find(([name]) => name === "field.tsx")?.[1]).toContain("tw:border-0 tw:p-0");
    expect(shadcnDialog).toContain("<DialogViewport>");
    expect(shadcnDialog).toContain("tw:flex tw:items-center tw:justify-center");
    expect(appCss).toMatch(/\.custom-select-trigger\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
    expect(appCss).toMatch(/\.exp-search\s*\{[\s\S]*?min-height:\s*var\(--control-height\)/);
  });

  it("Quick Ask réserve les marges du textarea dans sa largeur", () => {
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*width:\s*calc\(100% - 32px\)/);
    expect(appCss).toMatch(/\.qa-input\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("le textarea du composer peut réellement grandir sans être comprimé par flex", () => {
    expect(appCss).toMatch(/\.ta-wrap textarea\s*\{[^}]*flex:\s*none;/s);
  });

  it("modifier un message conserve exactement sa typographie de bulle", () => {
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.user-bubble\s*\{[^}]*line-height:\s*1\.55/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-size:\s*var\(--chat-fs, var\(--fs-xl\)\)/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*font-weight:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*letter-spacing:\s*inherit/s);
    expect(appCss).toMatch(/\.edit-message-textarea\s*\{[^}]*line-height:\s*1\.55/s);
  });

  it("le bouton de fermeture Mermaid reste transparent dans tous ses états", () => {
    expect(appCss).toMatch(/\.mermaid-fullscreen-close\s*\{[^}]*background:\s*transparent/s);
    expect(appCss).toMatch(
      /\.mermaid-fullscreen-close:hover,\s*\.mermaid-fullscreen-close:focus-visible\s*\{[^}]*background:\s*transparent/s,
    );
    expect(appCss).toMatch(/\.mermaid-fullscreen-close:focus-visible\s*\{[^}]*outline:\s*none/s);
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
    for (const primitive of [".ui-tab {", ".ui-activity {", ".ui-scroll-to-bottom {"]) {
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
