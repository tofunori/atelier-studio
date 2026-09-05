import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));

import { setLanguage } from "../lib/i18n";
import { renderUi } from "../test/render";
import { resetPendingPassageOpenForTests, setPendingPassageOpen } from "../lib/pendingPassageOpen";
import BiblioSurface, { summarizeZoteroAddResults } from "./BiblioSurface";

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

// Revue finale de branche, finding 1 : chat-open-zotero-passage part de façon
// SYNCHRONE (openZoteroPassage, md.tsx) au moment même où App.tsx bascule la
// surface — mais BiblioSurface ne monte qu'au rendu SUIVANT, donc son
// listener n'existe pas encore (premier clic perdu). openZoteroPassage pose
// une entrée dans pendingPassageOpen AVANT le dispatch ; au montage,
// BiblioSurface doit la consommer et rouvrir le lecteur comme s'il venait de
// recevoir l'événement — ici vérifié par le flag localStorage qu'ouvrir le
// lecteur bascule, sans dépendre d'une liste d'items Zotero simulée.
describe("BiblioSurface — passage zotero pending (finding 1, revue finale de branche)", () => {
  beforeEach(() => {
    setLanguage("fr");
    localStorage.clear();
    resetPendingPassageOpenForTests();
  });
  afterEach(() => {
    cleanup();
    resetPendingPassageOpenForTests();
  });

  it("attend la réponse avant d’annoncer une bibliothèque vide", () => {
    const ws = {readyState: WebSocket.OPEN, send: vi.fn()} as unknown as WebSocket;
    renderUi(<BiblioSurface ws={ws} projectRoot="/proj" galleryUrl="" />);
    expect(screen.getByText("Chargement des références…")).toBeTruthy();
    expect(screen.queryByText("Aucune référence.")).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent("zotero-items", {detail: {items: []}})));
    expect(screen.queryByText("Chargement des références…")).toBeNull();
    expect(screen.getByText("Aucune référence.")).toBeTruthy();
  });

  it("distingue une déconnexion d’une bibliothèque vide", () => {
    renderUi(<BiblioSurface ws={null} projectRoot="/proj" galleryUrl="" />);
    expect(screen.getByText("Bibliothèque indisponible — reconnexion en cours.")).toBeTruthy();
    expect(screen.queryByText("Aucune référence.")).toBeNull();
  });

  it("un passage pending (event perdu avant montage) rouvre le lecteur au montage", () => {
    localStorage.setItem("atelier-studio.biblio.reader", "0");
    setPendingPassageOpen({
      kind: "zotero",
      detail: { key: "ITEM1", pdfKey: "PDF1", pdfFile: "paper.pdf", page: 7, quote: "resultat important" },
      ts: Date.now(),
    });
    renderUi(<BiblioSurface ws={null} projectRoot="/proj" galleryUrl="" />);
    expect(localStorage.getItem("atelier-studio.biblio.reader")).toBe("1");
  });

  it("une entrée pending d'un autre kind (gbrain) est ignorée par BiblioSurface", () => {
    localStorage.setItem("atelier-studio.biblio.reader", "0");
    setPendingPassageOpen({ kind: "gbrain", detail: { slug: "s-1", quote: "q" }, ts: Date.now() });
    renderUi(<BiblioSurface ws={null} projectRoot="/proj" galleryUrl="" />);
    expect(localStorage.getItem("atelier-studio.biblio.reader")).toBe("0");
  });
});
