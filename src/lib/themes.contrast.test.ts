// Contraste WCAG de chaque preset, dans chaque mode qu'il propose (A4,
// 2026-10-21). Tout rôle de TEXTE atteint 4,5:1 sur les quatre fonds où il
// se pose (--bg, --bg-ctl, --bg-pop, --bg-card). --text-disabled n'y figure
// pas : il est réservé au désactivé et aux marques non textuelles.
import { describe, expect, it } from "vitest";
import { contrast, ensureContrast, hueDistance } from "./contrast";
import { THEME_PRESETS, followsAppearanceMode, resolveAppearanceTheme, themeContractVars } from "./themes";

const TEXT_ROLES = ["--text-primary", "--text-secondary", "--text-muted", "--accent-text", "--status-running"] as const;
const BACKGROUNDS = ["--bg", "--bg-ctl", "--bg-pop", "--bg-card"] as const;

const cases = THEME_PRESETS.flatMap((preset) => {
  const modes: ("dark" | "light")[] = followsAppearanceMode(preset.id) ? ["dark", "light"] : [preset.dark ? "dark" : "light"];
  return modes.map((mode) => {
    const resolved = resolveAppearanceTheme({ themePreset: preset.id, theme: mode }, mode === "dark");
    return { name: `${preset.id} (${mode})`, vars: themeContractVars(resolved), raw: resolved.vars };
  });
});

describe("contraste des presets (WCAG AA, texte 4,5:1)", () => {
  it("couvre tous les presets et les deux modes des presets qui suivent l'apparence", () => {
    expect(cases.length).toBe(THEME_PRESETS.length + THEME_PRESETS.filter((p) => followsAppearanceMode(p.id)).length);
  });

  for (const { name, vars } of cases) {
    it(`${name} : chaque rôle de texte passe 4,5:1 sur chaque fond`, () => {
      const failures: string[] = [];
      for (const role of TEXT_ROLES) {
        for (const bg of BACKGROUNDS) {
          const ratio = contrast(vars[role], vars[bg]);
          if (!(ratio >= 4.5)) failures.push(`${role} ${vars[role]} sur ${bg} ${vars[bg]} = ${ratio.toFixed(2)}:1`);
        }
      }
      expect(failures).toEqual([]);
    });
    it(`${name} : les statuts écrits se lisent sur chaque fond (≥ 4,5:1)`, () => {
      for (const role of ["--status-error", "--status-warning", "--status-success"]) {
        for (const bg of BACKGROUNDS) {
          expect(contrast(vars[role], vars[bg]), `${role} sur ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }

  it("claude-code : la palette passe d'elle-même, sans correction à l'exécution", () => {
    for (const mode of ["dark", "light"] as const) {
      const resolved = resolveAppearanceTheme({ themePreset: "claude-code", theme: mode }, mode === "dark");
      const vars = themeContractVars(resolved);
      expect(vars["--text-muted"]).toBe(resolved.vars["--muted"]);
    }
  });

  it("claude-code : l'erreur s'éloigne d'au moins 30° de l'accent, et l'accent écrit reste orange", () => {
    for (const mode of ["dark", "light"] as const) {
      const vars = themeContractVars(resolveAppearanceTheme({ themePreset: "claude-code", theme: mode }, mode === "dark"));
      expect(hueDistance(vars["--status-error"], vars["--accent"])).toBeGreaterThanOrEqual(30);
      expect(hueDistance(vars["--accent-text"], vars["--accent"])).toBeLessThan(10);
      expect(vars["--status-running"]).toBe(vars["--accent-text"]);
    }
    // l'accent de remplissage n'est jamais modifié (themes.test.ts le fige)
    const dark = themeContractVars(resolveAppearanceTheme({ themePreset: "claude-code", theme: "dark" }, true));
    expect(dark["--accent"]).toBe("#d97757");
  });

  it("ensureContrast rend la couleur intacte quand elle passe déjà", () => {
    expect(ensureContrast("#ffffff", "#000000", ["#000000"])).toBe("#ffffff");
    const fixed = ensureContrast("#777777", "#ffffff", ["#5a5a5a"]);
    expect(contrast(fixed, "#5a5a5a")).toBeGreaterThanOrEqual(4.5);
  });
});
