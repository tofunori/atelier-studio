import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import DocumentsSurface from "./DocumentsSurface";
import { shortDate } from "./documentsDate";

const GALLERY = "http://127.0.0.1:8765/figures_index.html#atelier_nonce=abc";
const NOW = Date.now();
let posted: unknown[] = [];

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
  posted = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/docx/new")) {
      posted.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ path: "documents/Chapitre 3.docx" }), { status: 200 });
    }
    return new Response(JSON.stringify({ documents: [
      { path: "manuscrit/Chapitre1_brouillon.docx", mtime: NOW, changes: 3 },
      { path: "Plan de thèse.docx", mtime: NOW - 40 * 86_400_000, changes: 0 },
    ] }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DocumentsSurface", () => {
  it("liste les .docx du projet et ouvre un document dans un onglet, nonce compris", async () => {
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    const row = await screen.findByText("Chapitre1_brouillon.docx");
    expect(screen.getByText("3 suivis")).toBeTruthy();
    expect(screen.getByText("Dans le projet")).toBeTruthy();
    fireEvent.click(row);
    const frame = document.querySelector("iframe.docs-frame") as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.pathname).toBe("/.fig_thumbs/docx_studio.html");
    expect(url.searchParams.get("path")).toBe("manuscrit/Chapitre1_brouillon.docx");
    expect(url.hash).toBe("#atelier_nonce=abc");
    // Ouvert = récent, et l'onglet survit au remontage.
    expect(screen.getByText("Récents")).toBeTruthy();
    cleanup();
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    expect(screen.getByRole("tab", { name: "Chapitre1_brouillon.docx" })).toBeTruthy();
  });

  it("crée un article dans documents/ et l'ouvre", async () => {
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    await screen.findByText("Plan de thèse.docx");
    fireEvent.click(screen.getByRole("button", { name: /Nouveau/ }));
    fireEvent.change(await screen.findByLabelText("Nom"), { target: { value: "Chapitre 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(posted).toEqual([{ name: "Chapitre 3", dir: "documents", template: "article" }]));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Chapitre 3.docx" })).toBeTruthy());
  });

  it("masque la liste au bouton et au raccourci ⌘\\, et s'en souvient", async () => {
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    await screen.findByText("Plan de thèse.docx");
    const side = document.querySelector(".docs-side") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: /Masquer la liste/ }));
    expect(side.hidden).toBe(true);
    cleanup();
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(true);
    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(false);
    expect(screen.getByRole("button", { name: /Masquer la liste/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("dates courtes : heure aujourd'hui, hier, sinon jour et mois", () => {
    const now = new Date(2026, 9, 19, 20, 0);
    expect(shortDate(new Date(2026, 9, 19, 18, 39).getTime(), now)).toMatch(/^modifié 18/);
    expect(shortDate(new Date(2026, 9, 18, 9, 0).getTime(), now)).toBe("hier");
    expect(shortDate(new Date(2026, 9, 2).getTime(), now)).toMatch(/2/);
  });
});
