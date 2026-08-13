import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));

import { setLanguage } from "../lib/i18n";
import { summarizeZoteroAddResults } from "./BiblioSurface";

describe("BiblioSurface Zotero add feedback", () => {
  beforeEach(() => setLanguage("fr"));

  it("résume les succès, doublons et erreurs sans laisser un échec silencieux", () => {
    const summary = summarizeZoteroAddResults([
      { name: "ok.pdf", ok: true },
      { name: "duplicate.pdf", ok: false, error: "duplicate", match: "Article existant" },
      { name: "broken.pdf", ok: false, error: "invalid-pdf" },
    ]);

    expect(summary).toContain("1 PDF envoyé");
    expect(summary).toContain("Article existant");
    expect(summary).toContain("1 PDF n’a pas pu être ajouté");
  });

  it("explique explicitement quand Zotero est fermé", () => {
    expect(
      summarizeZoteroAddResults([{ name: "paper.pdf", ok: false, error: "zotero-off" }]),
    ).toBe("Zotero doit être ouvert pour ajouter des PDF.");
  });

  it("distingue un délai dépassé d’un Zotero fermé pour éviter un nouvel import aveugle", () => {
    expect(
      summarizeZoteroAddResults([{ name: "paper.pdf", ok: false, error: "zotero-timeout" }]),
    ).toContain("vérifiez la bibliothèque avant de réessayer");
  });
});
