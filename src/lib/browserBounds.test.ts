// Position de la webview NATIVE du panneau navigateur. La fenêtre est en
// titleBarStyle "Overlay" (tauri.conf.json) : l'origine native et l'origine
// DOM coïncident — le rect de .browser-body EST la cible, sans compensation.
// Le bug corrigé ici : on ajoutait EN PLUS la hauteur de .browser-bar, déjà
// comptée puisque .browser-body est sous elle dans le flux → bande de fond
// sombre de ~36 px entre la barre et la page (vécu 2026-08-27).
import { describe, expect, it } from "vitest";
import { composeBrowserBounds } from "./browserBounds";

const r = (left: number, top: number, right: number, bottom: number) =>
  ({ left, top, right, bottom }) as DOMRect;

describe("composeBrowserBounds", () => {
  it("la webview épouse exactement .browser-body — aucun décalage ajouté", () => {
    const out = composeBrowserBounds({
      area: r(8, 96, 808, 696),
      viewport: r(0, 0, 1200, 800),
    });
    expect(out).toEqual({ x: 8, y: 96, w: 800, h: 600 });
  });

  it("clippée par le panneau et jamais au-dessus du chrome", () => {
    const out = composeBrowserBounds({
      area: r(8, 60, 808, 900),
      pane: r(10, 80, 700, 760),
      chromeBottom: 96,
      viewport: r(0, 0, 1200, 800),
    });
    expect(out).toEqual({ x: 10, y: 96, w: 690, h: 664 });
  });

  it("surface trop petite : null (webview cachée plutôt qu'écrasée)", () => {
    expect(composeBrowserBounds({
      area: r(0, 100, 5, 700),
      viewport: r(0, 0, 1200, 800),
    })).toBeNull();
    expect(composeBrowserBounds({
      area: r(0, 795, 800, 800),
      viewport: r(0, 0, 1200, 800),
    })).toBeNull();
  });
});
