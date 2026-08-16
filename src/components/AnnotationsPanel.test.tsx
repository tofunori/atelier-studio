// Panneau Annotations autonome (jumeau large de l'Explorateur) : sections par
// article, recherche, actions — données /pdfannot-all mockées.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import AnnotationsPanel, { annotCiteRef, annotQuoteText } from "./AnnotationsPanel";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";

const LIB = {
  "zotero/AAAA1111/Schielzeth et Forstmeier - 2009 - Conclusions beyond support.pdf": [
    { id: "100", page: 1, kind: "hl", text: "random slope models give appropriate standard errors", color: "rgba(120,220,140,.40)" },
    { id: "200", page: 3, kind: "note", note: "vérifier nos M18-M29", color: "rgba(120,170,255,.40)" },
  ],
  "zotero/BBBB2222/Moran et al. - 2026 - Operational chemical weather forecasting.pdf": [
    { id: "300", page: 5, kind: "area", note: "figure du domaine", color: "rgba(255,213,74,.40)" },
  ],
};

function mockFetch(payload: unknown = { annots: LIB }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve({ json: () => Promise.resolve(payload) });
  }));
  return calls;
}

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("annotCiteRef / annotQuoteText", () => {
  it("dérive Auteur Année du nom de fichier, sinon nom tronqué", () => {
    expect(annotCiteRef("zotero/K/Williamson et al. - 2025 - Temperature something.pdf"))
      .toBe("Williamson et al. 2025");
    expect(annotCiteRef("papers/notes.pdf")).toBe("notes");
  });
  it("le texte d'attache reprend rel, page, citation et commentaire", () => {
    const out = annotQuoteText("zotero/K/X - 2020 - Y.pdf", {
      id: "1", page: 4, kind: "hl", text: "la  citation   exacte", note: "à citer",
    });
    expect(out).toContain("(p.4)");
    expect(out).toContain("« la citation exacte »");
    expect(out).toContain("Commentaire : à citer");
  });
});

describe("AnnotationsPanel", () => {
  it("liste les articles en sections, le plus récemment annoté déplié", async () => {
    mockFetch();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Schielzeth et Forstmeier 2009")).toBeTruthy());
    expect(screen.getByText("Moran et al. 2026")).toBeTruthy();
    // maxTs : Moran (300) > Schielzeth (200) → Moran déplié, sa zone visible
    expect(screen.getByText(/zone · figure du domaine/)).toBeTruthy();
    // Schielzeth replié : sa citation absente
    expect(screen.queryByText(/random slope models/)).toBeNull();
  });

  it("déplie au clic et ouvre l'annotation visée", async () => {
    mockFetch();
    const onOpen = vi.fn();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={onOpen} onQuote={vi.fn()} />);
    await waitFor(() => screen.getByText("Schielzeth et Forstmeier 2009"));
    fireEvent.click(screen.getByText("Schielzeth et Forstmeier 2009"));
    const quote = await screen.findByText(/random slope models/);
    fireEvent.click(quote);
    expect(onOpen).toHaveBeenCalledWith(
      "zotero/AAAA1111/Schielzeth et Forstmeier - 2009 - Conclusions beyond support.pdf", "100");
  });

  it("la recherche filtre à travers tous les articles et déplie les résultats", async () => {
    mockFetch();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={vi.fn()} />);
    await waitFor(() => screen.getByText("Schielzeth et Forstmeier 2009"));
    fireEvent.change(screen.getByPlaceholderText("Chercher dans les annotations…"),
      { target: { value: "slope" } });
    expect(await screen.findByText(/random slope models/)).toBeTruthy();
    expect(screen.queryByText("Moran et al. 2026")).toBeNull();
  });

  it("supprimer poste la liste réduite au bon rel", async () => {
    const calls = mockFetch();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={vi.fn()} />);
    await waitFor(() => screen.getByText(/zone · figure du domaine/));
    fireEvent.click(screen.getByLabelText("Supprimer"));
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith("/pdfannot") && c.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body));
      expect(body.rel).toContain("Moran");
      expect(body.annots).toEqual([]);
    });
  });

  it("envoyer au chat livre le texte d'attache formé", async () => {
    mockFetch();
    const onQuote = vi.fn();
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={onQuote} />);
    await waitFor(() => screen.getByText(/zone · figure du domaine/));
    fireEvent.click(screen.getByLabelText("Envoyer au chat"));
    expect(onQuote).toHaveBeenCalledWith(expect.stringContaining("(p.5)"));
    expect(onQuote).toHaveBeenCalledWith(expect.stringContaining("Commentaire : figure du domaine"));
  });

  it("échec de chargement : message honnête, pas d'écran vide", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    renderUi(<AnnotationsPanel galleryOrigin="http://127.0.0.1:1" onOpenAnnot={vi.fn()} onQuote={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Annotations indisponibles/)).toBeTruthy());
  });
});
