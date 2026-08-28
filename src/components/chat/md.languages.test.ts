// Budget d'entrée (scripts/check_entry_budget.mjs) : `highlight.js/lib/common`
// embarquait 36 langages — 375 Ko de source, 13 % du bundle d'entrée — pour
// une quinzaine réellement utilisés. L'entrée dépassait le plafond de 950 Ko
// (CI rouge, 1055 Ko, 2026-08-27). On enregistre donc explicitement les
// langages du travail de Thierry ; le reste retombe sur highlightAuto, qui ne
// les détecte simplement plus.
import { describe, expect, it } from "vitest";
import { hasRegisteredLanguage, LANG_ALIAS } from "./md";

const ATTENDUS = [
  "python", "r", "julia", "latex", "bash", "javascript", "typescript",
  "json", "yaml", "sql", "markdown", "diff", "rust", "xml", "css",
];

describe("langages de coloration", () => {
  it.each(ATTENDUS)("%s reste colorisé", (lang) => {
    expect(hasRegisteredLanguage(lang)).toBe(true);
  });

  it("les alias du quotidien résolvent vers un langage enregistré", () => {
    for (const alias of ["py", "jl", "tex", "bib", "sty", "rs", "ts", "tsx", "js", "yml", "sh", "zsh", "md"]) {
      expect(hasRegisteredLanguage(alias), `alias ${alias} → ${LANG_ALIAS[alias]}`).toBe(true);
    }
  });

  it("les langages écartés ne sont plus embarqués (preuve de l'élagage)", () => {
    for (const lang of ["java", "kotlin", "swift", "php", "objectivec", "vbnet", "wasm"]) {
      expect(hasRegisteredLanguage(lang), `${lang} encore embarqué`).toBe(false);
    }
  });
});
