import { describe, expect, it } from "vitest";
import { followsAppearanceMode, galleryLegacyThemeVars, presetById, resolveAppearanceTheme, themeContractVars, xtermThemeFor } from "./themes";

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

describe("Claude Code theme", () => {
  it("follows the light, dark and system modes like Atelier", () => {
    expect(followsAppearanceMode("claude-code")).toBe(true);
    expect(followsAppearanceMode("nord")).toBe(false);
    const dark = resolveAppearanceTheme({ themePreset: "claude-code", theme: "dark" }, false);
    const light = resolveAppearanceTheme({ themePreset: "claude-code", theme: "light" }, true);
    const system = resolveAppearanceTheme({ themePreset: "claude-code", theme: "system" }, false);
    expect(dark.dark).toBe(true);
    expect(dark.vars["--bg"]).toBe("#1a1a19");
    expect(dark.vars["--accent"]).toBe("#d97757");
    expect(light.dark).toBe(false);
    expect(light.vars["--bg"]).toBe("#faf9f5");
    expect(system.vars["--bg"]).toBe("#faf9f5");
    expect(light.ansi).toHaveLength(16);
  });

  it("has the same twelve palette fields as every preset, in both modes", () => {
    const base = Object.keys(presetById("atelier").vars).sort();
    for (const theme of ["dark", "light"] as const) {
      const vars = resolveAppearanceTheme({ themePreset: "claude-code", theme }, true).vars;
      expect(base.every((key) => typeof vars[key] === "string")).toBe(true);
    }
  });

  it("gives chat links and inline code their own colors, and resets them for other themes", () => {
    const claude = themeContractVars(resolveAppearanceTheme({ themePreset: "claude-code", theme: "dark" }, true));
    expect(claude["--link"]).toBe("#7aa6e7");
    expect(claude["--code-inline"]).toBe("#de8481");
    const nord = themeContractVars(presetById("nord"));
    expect(nord["--link"]).toBe("currentColor");
    expect(nord["--code-inline"]).toBe("currentColor");
    expect(nord["--link-hover"]).toBe(presetById("nord").vars["--accent"]);
  });
});

