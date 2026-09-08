import { describe, expect, it } from "vitest";
import { galleryLegacyThemeVars, resolveAppearanceTheme, themeContractVars, xtermThemeFor } from "./themes";

describe("Appearance mode", () => {
  it("honors explicit light mode and preserves canonical dark tokens", () => {
    expect(resolveAppearanceTheme({ themePreset: "atelier", theme: "light" }, true).vars["--bg"]).toBe("#f1f4f7");
    expect(resolveAppearanceTheme({ themePreset: "atelier", theme: "dark" }, false).vars["--border"]).toBe("#2a2d31");
  });
  it("follows the system only in system mode and keeps named palettes", () => {
    const selection = { themePreset: "atelier", theme: "system" as const };
    expect(resolveAppearanceTheme(selection, false).dark).toBe(false);
    expect(resolveAppearanceTheme(selection, true).dark).toBe(true);
    expect(resolveAppearanceTheme({ themePreset: "nord", theme: "dark" }, false).id).toBe("nord");
  });
  it("gives the terminal the same resolved light palette", () => {
    const selection = { themePreset: "atelier", theme: "system" as const };
    const resolved = resolveAppearanceTheme(selection, false);
    const terminal = xtermThemeFor(selection, false);
    expect(terminal.background).toBe(resolved.vars["--bg-side"]);
    expect(terminal.foreground).toBe(resolved.vars["--fg"]);
    expect(terminal.red).toBe(resolved.ansi?.[1]);
  });

  it("keeps the gallery's secondary --fg alias at the iframe boundary", () => {
    const raw: Record<string, string> = {
      ...resolveAppearanceTheme({ themePreset: "atelier", theme: "dark" }, true).vars,
      "--fg": "#custom-primary",
    };
    const contract = themeContractVars({ dark: true, vars: raw });
    const gallery = galleryLegacyThemeVars({ vars: raw });
    expect(contract["--fg"]).toBe("#custom-primary");
    expect(contract["--text-primary"]).toBe("#custom-primary");
    expect(gallery["--fg"]).toBe(raw["--fg2"]);
  });
});
