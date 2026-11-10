// Verrou de la famille d'icônes (2026-11-10) : UNE famille (Lucide), deux
// tailles de travail (12 et 14 px ; 16 px et plus pour la navigation et les
// états vides). Un dessin <svg> écrit à la main dans un composant ramène le
// mélange de grilles, de bouts et d'angles que cette passe a retiré.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const components = join(__dirname, "..");

/** Dessins qui ne sont PAS des icônes de la famille, et combien par fichier.
 *  Ajouter une ligne ici demande une raison du même ordre. */
const DRAWN: Record<string, number> = {
  "icons.tsx": 4, // logos des fournisseurs (Claude, Codex, Grok) et pont entre sessions
  "RailActivity.tsx": 1, // anneau de progression
  "RailSignalMark.tsx": 1, // signal du rail (repère, pas une icône)
  "UsagePopover.tsx": 1, // anneau d'usage
  "ChatBench.tsx": 2, // vignettes d'exemple du banc (data URL)
  "chat/ChatTimeline.tsx": 1, // repère de la marge
  "chat/ComposerControls.tsx": 1, // anneau de contexte
  "chat/KbPicker.tsx": 1, // marque Zotero
  "chat/md.tsx": 1, // étincelle
  "chat/toolPresentation.tsx": 1, // anneau d'exécution
  "chat/turns.tsx": 1, // étincelle du tour
  "git/commitGraph.tsx": 1, // graphe des commits
  "shadcn/checkbox.tsx": 1, // marque de la case
  "sidebar/ChatSeal.tsx": 1, // sceau de conversation
  "sidebar/ConversationFamilyMarker.tsx": 1, // marqueur de famille
  "ui/Spinner.tsx": 1, // spinner
};

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sources(path);
  return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
});
const files = sources(components).map((path) => ({
  name: relative(components, path).split("\\").join("/"),
  code: readFileSync(path, "utf8"),
}));

describe("famille d'icônes", () => {
  it("aucun <svg> écrit à la main hors des dessins recensés", () => {
    const found: Record<string, number> = {};
    for (const { name, code } of files) {
      const count = code.split("<svg").length - 1;
      if (count) found[name] = count;
    }
    expect(found).toEqual(DRAWN);
  });

  it("aucune taille d'icône hors grille (9, 10, 11, 13, 15, 17 px)", () => {
    // Spinner et logos de fournisseur ont leur propre échelle
    const offGrid = /<(?!Spinner\b|ProviderIcon\b|ClaudeIcon\b|CodexIcon\b|GrokIcon\b)([A-Z]\w*)\b[^<>]*?\bsize=\{(9|10|11|13|15|17)\}/g;
    const offenders = files.flatMap(({ name, code }) => [...code.matchAll(offGrid)].map((m) => `${name} : <${m[1]} size={${m[2]}}>`));
    expect(offenders).toEqual([]);
  });

  it("une icône sans taille déclarée tombe à 14 px, pas à 24", () => {
    const css = readFileSync(join(components, "..", "styles", "shadcn.css"), "utf8");
    expect(css).toMatch(/:where\(svg\.lucide\[width="24"\]\[height="24"\]\)\s*\{\s*width:\s*var\(--icon-m\);\s*height:\s*var\(--icon-m\);/);
  });
});
