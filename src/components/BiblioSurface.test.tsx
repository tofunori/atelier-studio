import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));

import { setLanguage } from "../lib/i18n";
import { renderUi } from "../test/render";
import { resetPendingPassageOpenForTests, setPendingPassageOpen } from "../lib/pendingPassageOpen";
import BiblioSurface, { pdfViewerUrl, summarizeZoteroAddResults } from "./BiblioSurface";

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
    // le texte « Chargement… » est devenu un squelette de six rangées
    expect(screen.getByLabelText("Chargement des références…")).toBeTruthy();
    expect(document.querySelectorAll(".biblio-skeleton")).toHaveLength(6);
    expect(screen.queryByText("Aucune référence.")).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent("zotero-items", {detail: {items: []}})));
    expect(screen.queryByLabelText("Chargement des références…")).toBeNull();
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

// ── Liste : course de requêtes, filtrage local, clavier, menu contextuel ──
type FakeWs = WebSocket & { send: ReturnType<typeof vi.fn> };

function makeWs(): FakeWs {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as FakeWs;
}

function sent(ws: FakeWs, type: string): Record<string, unknown>[] {
  return ws.send.mock.calls
    .map((call) => JSON.parse(call[0] as string) as Record<string, unknown>)
    .filter((msg) => msg.type === type);
}

type TestItem = {
  key: string; title: string; creators: string; year: string; publication: string;
  dateAdded: string; hasPdf: boolean; fav: boolean;
};

function fixture(partial: Partial<TestItem> & { key: string }) {
  return {
    dateAdded: "2024-01-01", title: `Titre ${partial.key}`, creators: "Auteur", year: "2020",
    publication: "Revue", tags: [], hasPdf: false, pdfKey: null, pdfFile: null,
    citeKey: `cite${partial.key}`, fav: false, ...partial,
  };
}

const ITEMS = [
  fixture({ key: "A", title: "Névés du Québec", creators: "Émile Durand", year: "2001", hasPdf: true }),
  fixture({ key: "B", title: "Albedo of ice", creators: "Ana Blanc", year: "2020", dateAdded: "2024-05-01" }),
  fixture({ key: "C", title: "Melt ponds", creators: "Zoé Arctique", year: "1998", fav: true, dateAdded: "2024-03-01" }),
];

function deliver(items: unknown[], requestId?: number, extra: Record<string, unknown> = {}) {
  act(() => window.dispatchEvent(new CustomEvent("zotero-items", { detail: { items, requestId, ...extra } })));
}

function rowTitles(): string[] {
  return [...document.querySelectorAll(".biblio-row .biblio-title")].map((el) => el.textContent ?? "");
}

describe("BiblioSurface — liste, course de requêtes et clavier", () => {
  beforeEach(() => {
    setLanguage("fr");
    localStorage.clear();
    resetPendingPassageOpenForTests();
  });
  afterEach(() => {
    cleanup();
    resetPendingPassageOpenForTests();
    vi.useRealTimers();
  });

  function mount(ws: FakeWs) {
    renderUi(<BiblioSurface ws={ws} projectRoot="/proj" galleryUrl="" />);
    return ws;
  }

  it("charge le catalogue de la portée une seule fois, sans q et avec limit 5000", () => {
    const ws = mount(makeWs());
    const searches = sent(ws, "zoteroSearch");
    expect(searches).toHaveLength(1);
    expect(searches[0].q).toBe("");
    expect(searches[0].limit).toBe(5000);
    expect(searches[0].requestId).toBe(1);
  });

  it("ignore une réponse périmée arrivant après la plus récente", () => {
    const ws = mount(makeWs());
    // la portée change : une seconde requête part, la première est périmée
    act(() => fireEvent.click(screen.getByRole("button", { name: "Favoris" })));
    const ids = sent(ws, "zoteroSearch").map((msg) => msg.requestId as number);
    expect(ids).toEqual([1, 2]);

    deliver([fixture({ key: "NEW", title: "Réponse récente", fav: true })], ids[1]);
    expect(rowTitles()).toEqual(["Réponse récente"]);
    // la réponse de la requête 1 arrive EN RETARD : elle ne doit rien écraser
    deliver([fixture({ key: "OLD", title: "Réponse périmée", fav: true })], ids[0]);
    expect(rowTitles()).toEqual(["Réponse récente"]);
  });

  it("la saisie filtre localement sans aucun envoi réseau", async () => {
    vi.useFakeTimers();
    const ws = mount(makeWs());
    deliver(ITEMS, 1);
    expect(rowTitles()).toHaveLength(3);

    const before = ws.send.mock.calls.length;
    act(() => fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "neves" } }));
    act(() => vi.advanceTimersByTime(400));
    expect(ws.send.mock.calls.length).toBe(before);
    expect(rowTitles()).toEqual(["Névés du Québec"]);
  });

  it("changer de portée déclenche un nouvel envoi", () => {
    const ws = mount(makeWs());
    deliver(ITEMS, 1);
    expect(sent(ws, "zoteroSearch")).toHaveLength(1);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Favoris" })));
    expect(sent(ws, "zoteroSearch")).toHaveLength(2);
  });

  it("changer de collection recharge le catalogue de la nouvelle portée", async () => {
    const ws = mount(makeWs());
    deliver(ITEMS, 1);
    act(() => window.dispatchEvent(new CustomEvent("zotero-collections", {
      detail: { collections: [{ id: 7, name: "Glaciologie", parent: null }] },
    })));
    const option = await screen.findByText("Glaciologie");
    fireEvent.click(option);
    const searches = sent(ws, "zoteroSearch");
    expect(searches).toHaveLength(2);
    expect(searches[1].collection).toBe("7");
    expect(searches[1].collectionId).toBe("7");
    expect(searches[1].q).toBe("");
  });

  it("le filtre favoris et le filtre PDF réduisent la liste", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    act(() => fireEvent.click(screen.getByLabelText("Seulement avec PDF")));
    expect(rowTitles()).toEqual(["Névés du Québec"]);
    act(() => fireEvent.click(screen.getByLabelText("Seulement avec PDF")));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Favoris" })));
    deliver(ITEMS, 2);
    expect(rowTitles()).toEqual(["Melt ponds"]);
  });

  it("le tri change l'ordre de la liste", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(rowTitles()).toEqual(["Albedo of ice", "Melt ponds", "Névés du Québec"]);
    act(() => { localStorage.setItem("atelier-studio.biblio.sort", "year"); });
    cleanup();
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(rowTitles()).toEqual(["Albedo of ice", "Névés du Québec", "Melt ponds"]);
  });

  it("↑/↓ déplacent la sélection et marquent aria-selected", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    const list = document.querySelector(".biblio-list") as HTMLElement;
    act(() => fireEvent.keyDown(list, { key: "ArrowDown" }));
    expect(document.querySelector('[aria-selected="true"] .biblio-title')?.textContent).toBe("Albedo of ice");
    act(() => fireEvent.keyDown(list, { key: "ArrowDown" }));
    expect(document.querySelector('[aria-selected="true"] .biblio-title')?.textContent).toBe("Melt ponds");
    act(() => fireEvent.keyDown(list, { key: "ArrowUp" }));
    expect(document.querySelector('[aria-selected="true"] .biblio-title')?.textContent).toBe("Albedo of ice");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it("« / » met le curseur dans la recherche, Échap la vide", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    const input = screen.getByLabelText("Rechercher") as HTMLInputElement;
    act(() => fireEvent.keyDown(document.body, { key: "/" }));
    expect(document.activeElement).toBe(input);
    act(() => fireEvent.change(input, { target: { value: "melt" } }));
    act(() => fireEvent.keyDown(input, { key: "Escape" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(document.querySelector(".biblio-list"));
  });

  it("« f » bascule le favori de l'élément sélectionné", () => {
    const ws = mount(makeWs());
    deliver(ITEMS, 1);
    const list = document.querySelector(".biblio-list") as HTMLElement;
    act(() => fireEvent.keyDown(list, { key: "ArrowDown" }));
    act(() => fireEvent.keyDown(list, { key: "f" }));
    const favs = sent(ws, "zoteroFav");
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ key: "B", fav: true });
  });

  it("un favori refusé par le backend revient en arrière et s'affiche dans la zone d'état", () => {
    const ws = mount(makeWs());
    deliver(ITEMS, 1);
    act(() => fireEvent.click(screen.getAllByLabelText("Ajouter aux favoris")[0]));
    expect(sent(ws, "zoteroFav")[0]).toMatchObject({ key: "B", fav: true });
    // bascule optimiste : le bouton propose désormais le retrait
    expect(screen.getAllByLabelText("Retirer des favoris")).toHaveLength(2);
    act(() => window.dispatchEvent(new CustomEvent("zotero-fav", {
      detail: { key: "B", fav: true, ok: false, error: "disque plein" },
    })));
    expect(screen.getAllByLabelText("Retirer des favoris")).toHaveLength(1);
    expect(screen.getByText(/favori n’a pas pu être enregistré/)).toBeTruthy();
  });

  it("la rangée expose l'action PDF et une année en chiffres alignés", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(screen.getAllByRole("button", { name: /Ouvrir le PDF/ })).toHaveLength(3);
    expect(document.querySelectorAll(".biblio-table-year")).toHaveLength(3);
  });

  // ── Raffinement 2026-09-06 : une barre, des années, un rail ──

  it("une SEULE barre : plus de seconde ligne de filtres, et le raccourci « / » s'affiche", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(document.querySelector(".biblio-filters")).toBeNull();
    expect(document.querySelectorAll(".biblio-bar")).toHaveLength(1);
    expect(document.querySelector(".biblio-search-kbd")?.textContent).toBe("/");
    // le rail expose la portée active à la techno d'assistance
    expect(screen.getByRole("button", { name: "Favoris" }).getAttribute("aria-current")).toBeNull();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Favoris" })));
    expect(screen.getByRole("button", { name: "Favoris" }).getAttribute("aria-current")).toBe("true");
  });

  it("la ligne de portée annonce la collection, le nombre de références et de PDF", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    const scope = document.querySelector(".biblio-scope") as HTMLElement;
    expect(scope).toBeTruthy();
    expect(scope.textContent).toContain("Tous les articles");
    expect(scope.textContent).toContain("3 références");
    expect(scope.textContent).toContain("1 PDF");
  });

  it("les surtitres d'année n'apparaissent que sur un tri par date ou année", () => {
    localStorage.setItem("atelier-studio.biblio.sort", "year");
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(document.querySelectorAll(".biblio-year")).toHaveLength(0);
    cleanup();
    localStorage.setItem("atelier-studio.biblio.sort", "title");
    mount(makeWs());
    deliver(ITEMS, 1);
    expect(document.querySelectorAll(".biblio-year")).toHaveLength(0);
    expect(rowTitles()).toHaveLength(3);
  });

  it("la sélection est un rail porté par aria-selected, jamais un bloc « on »", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    const list = document.querySelector(".biblio-list") as HTMLElement;
    act(() => fireEvent.keyDown(list, { key: "ArrowDown" }));
    expect(document.querySelectorAll('.biblio-row[aria-selected="true"]')).toHaveLength(1);
    expect(document.querySelectorAll(".biblio-row.on")).toHaveLength(0);
    // le rail est un pseudo-élément accroché au SEUL sélecteur aria-selected
    const css = readFileSync(join(__dirname, "..", "App.css"), "utf8");
    expect(css).toMatch(
      /\.biblio-row\[aria-selected="true"\]::before \{[^}]*background:\s*var\(--selection-line\)/,
    );
    expect(css).not.toMatch(/\.biblio-row\.on\b/);
  });

  it("le badge PDF et l'étoile partagent le côté droit de la rangée", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    const side = document.querySelectorAll(".biblio-row-side");
    expect(side).toHaveLength(3);
    expect(side[2].querySelector('[aria-label^="Ouvrir le PDF"]')).toBeTruthy();
    expect(side[2].querySelector(".biblio-star")).toBeTruthy();
  });

  it("le panneau d'information expose Épingler et Citer en icônes discrètes", () => {
    mount(makeWs());
    deliver(ITEMS, 1);
    fireEvent.click(document.querySelector(".biblio-main-button") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Informations de l’article" }));
    const panel = document.querySelector(".biblio-information") as HTMLElement;
    expect(panel.querySelector('[aria-label="Ajouter à la base de connaissances"]')).toBeTruthy();
    expect(panel.querySelector('[aria-label="Citer"]')).toBeTruthy();
    expect(panel.querySelector(".ui-btn")).toBeNull();
  });

  it("conserve le même iframe quand on revient à la bibliothèque puis à l'article", () => {
    const ws = makeWs();
    renderUi(<BiblioSurface ws={ws} projectRoot="/proj" galleryUrl="http://gallery" />);
    deliver(ITEMS.map((item) => item.key === "A" ? { ...item, pdfKey: "PDFKEY01", pdfFile: "paper.pdf" } : item), 1);
    const row = [...document.querySelectorAll<HTMLElement>(".biblio-row")]
      .find((candidate) => candidate.textContent?.includes("Névés du Québec"))
      ?.querySelector(".biblio-main-button") as HTMLElement;
    fireEvent.doubleClick(row);
    const frame = document.querySelector(".biblio-frame") as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    const articleTab = screen.getByRole("tab", { name: "Névés du Québec" });
    fireEvent.click(screen.getByRole("tab", { name: "Bibliothèque" }));
    expect(frame.isConnected).toBe(true);
    expect(frame.closest(".biblio-reader")).toHaveAttribute("hidden");
    fireEvent.click(articleTab);
    expect(document.querySelector(".biblio-frame")).toBe(frame);
    expect(frame.closest(".biblio-reader")).not.toHaveAttribute("hidden");
  });

  it("le menu contextuel d'une rangée ouvre les actions et copie la clé Zotero", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount(makeWs());
    deliver(ITEMS, 1);
    const row = document.querySelectorAll(".biblio-row")[0] as HTMLElement;
    fireEvent.contextMenu(row);
    const copy = await screen.findByText("Copier la clé Zotero");
    expect(screen.getByText("Ouvrir le PDF")).toBeTruthy();
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith("B");
  });
});

// Lien de citation interne par section ou page : un lien de chat peut ne
// porter QUE la clé Zotero (ouvrir l'article), une page, ou une section
// numérotée. L'URL du lecteur vient toujours du PDF de l'item SÉLECTIONNÉ —
// le passage ne dit plus quel fichier ouvrir, seulement où aller dedans.
describe("pdfViewerUrl — cible de passage partielle (section / page / clé seule)", () => {
  const item = {
    key: "ITEM1", dateAdded: "", title: "T", creators: "C", year: "2020", publication: "",
    tags: [], hasPdf: true, pdfKey: "PDF1", pdfFile: "paper.pdf", citeKey: "c", fav: false,
  };
  const gallery = "http://127.0.0.1:8805/figures_index.html";

  it("passage à clé seule : l'article s'ouvre sans page ni citation", () => {
    const url = pdfViewerUrl(item, gallery, { key: "ITEM1" });
    expect(url).toContain("file=zotero%2FPDF1%2Fpaper.pdf");
    expect(url).not.toContain("page=");
    expect(url).not.toContain("quote=");
    expect(url).not.toContain("section=");
  });

  it("passage de section : section=2.4 est transmis au lecteur", () => {
    const url = pdfViewerUrl(item, gallery, { key: "ITEM1", section: "2.4" });
    expect(url).toContain("section=2.4");
    expect(url).not.toContain("page=");
  });

  it("passage complet : page et citation comme avant", () => {
    const url = pdfViewerUrl(item, gallery, {
      key: "ITEM1", pdfKey: "PDF1", pdfFile: "paper.pdf", page: 7, quote: "extrait",
    });
    expect(url).toContain("page=7");
    expect(url).toContain("quote=extrait");
  });

  it("passage d'un AUTRE article : rien n'est transmis", () => {
    const url = pdfViewerUrl(item, gallery, { key: "AUTRE", page: 3 });
    expect(url).not.toContain("page=");
  });
});
