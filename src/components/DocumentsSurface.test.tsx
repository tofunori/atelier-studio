import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import DocumentsSurface from "./DocumentsSurface";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue("http://127.0.0.1:18791/figures_index.html") }));
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
    if (url.startsWith("http://127.0.0.1:18791/")) {
      return new Response(JSON.stringify({ documents: [
        { path: "03_TP/TP6_K_puits.docx", mtime: NOW - 60_000, changes: 0 },
      ] }), { status: 200 });
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

  it("liste aussi les .docx des dossiers rattachés au projet et les ouvre par leur serveur", async () => {
    const folders = [{ path: "/Cours/GEO1063/2026", name: "2026", access: "read" as const, gallery: true }];
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" folders={folders} galleryDir="" galleryExts="" visible />);
    const row = await screen.findByText("TP6_K_puits.docx");
    expect(invoke).toHaveBeenCalledWith("start_atelier", expect.objectContaining({ root: "/Cours/GEO1063/2026" }));
    expect(screen.getByText("Chapitre1_brouillon.docx")).toBeTruthy();
    expect(screen.getByText(/^2026\/03_TP/)).toBeTruthy();
    fireEvent.click(row);
    const frame = document.querySelector("iframe.docs-frame") as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.origin).toBe("http://127.0.0.1:18791");
    expect(url.searchParams.get("path")).toBe("/Cours/GEO1063/2026/03_TP/TP6_K_puits.docx");
    expect(url.hash).toBe("#atelier_nonce=abc");
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

  it("masque le panneau au bouton et au raccourci ⌘\\, et s'en souvient", async () => {
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    await screen.findByText("Plan de thèse.docx");
    const side = document.querySelector(".docs-side") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: /Masquer le panneau/ }));
    expect(side.hidden).toBe(true);
    cleanup();
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(true);
    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(false);
    expect(screen.getByRole("button", { name: /Masquer le panneau/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("un seul panneau : Plan et Commentaires passent au document ouvert, au même endroit", async () => {
    renderUi(<DocumentsSurface galleryUrl={GALLERY} projectRoot="/p" visible />);
    await screen.findByText("Plan de thèse.docx");
    // Sans document ouvert, seuls les documents ont quelque chose à montrer.
    expect((screen.getByRole("radio", { name: "Plan" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Chapitre1_brouillon.docx"));
    const frame = document.querySelector("iframe.docs-frame") as HTMLIFrameElement;
    expect(new URL(frame.src).searchParams.get("panel")).toBe("host");
    const sent: unknown[] = [];
    vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((msg: unknown) => { sent.push(msg); });
    // Chargé : il reçoit l'état du panneau tout de suite, puis à chaque changement.
    fireEvent.load(frame);
    expect(sent).toContainEqual({ type: "atelier-docs-panel", open: true, tab: "docs" });
    fireEvent.click(screen.getByRole("radio", { name: "Plan" }));
    expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(true);
    await waitFor(() => expect(sent).toContainEqual({ type: "atelier-docs-panel", open: true, tab: "plan" }));
    // L'onglet Documents choisi dans le document revient à la liste.
    window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-docs-panel-tab", tab: "docs" }, origin: "http://127.0.0.1:8765", source: frame.contentWindow }));
    await waitFor(() => expect((document.querySelector(".docs-side") as HTMLElement).hidden).toBe(false));
    expect(sent).toContainEqual({ type: "atelier-docs-panel", open: true, tab: "docs" });
    // Le compte des commentaires ouverts suit le document.
    window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-docs-panel-count", comments: 7 }, origin: "http://127.0.0.1:8765", source: frame.contentWindow }));
    await waitFor(() => expect(document.querySelector(".docs-panel-count")?.textContent).toBe("7"));
  });

  it("dates courtes : heure aujourd'hui, hier, sinon jour et mois", () => {
    const now = new Date(2026, 9, 19, 20, 0);
    expect(shortDate(new Date(2026, 9, 19, 18, 39).getTime(), now)).toMatch(/^modifié 18/);
    expect(shortDate(new Date(2026, 9, 18, 9, 0).getTime(), now)).toBe("hier");
    expect(shortDate(new Date(2026, 9, 2).getTime(), now)).toMatch(/2/);
  });
});
