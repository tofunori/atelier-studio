import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactMarkdown from "react-markdown";
import { PassageCard } from "./PassageCard";
import { MD_COMPONENTS, type GbrainPassageRef, type ZoteroPassageRef } from "./md";
import { pushEvidencePins, resetEvidencePinsForTests, type EvidencePin } from "../../lib/evidencePins";

const send = vi.fn((_message: unknown) => true);
vi.mock("../../lib/wsBus", () => ({ wsSend: (message: unknown) => send(message) }));
const errorToast = vi.fn(async (_message: string) => {});
vi.mock("../ui/toast", () => ({ showError: (message: string) => errorToast(message) }));

const REF: ZoteroPassageRef = {
  kind: "zotero",
  key: "ABCD1234",
  pdfKey: "PDFKEY01",
  pdfFile: "Williamson et al. - 2021 - Ice sheet response to warming.pdf",
  page: 42,
  quote:
    "Un passage assez long pour vérifier que la troncature visuelle par ellipsis CSS ne casse rien à l'affichage replié de la carte.",
};

const GBRAIN_REF: GbrainPassageRef = {
  kind: "gbrain",
  slug: "williamson-2021-fire-aerosol",
  quote: "Fire aerosol deposition réduit l'albédo estival des glaciers.",
};

const PIN1: EvidencePin = {
  id: "pin1",
  ts: 1,
  quote: REF.quote,
  source: "zotero",
  zoteroKey: REF.key,
  pdfKey: REF.pdfKey,
  pdfFile: REF.pdfFile,
  page: REF.page,
  citeLabel: "Williamson et al. 2021",
  gbrainSlug: null,
  supports: null,
  threadId: null,
  provider: null,
};

const GBRAIN_PIN1: EvidencePin = {
  id: "gpin1",
  ts: 1,
  quote: GBRAIN_REF.quote,
  source: "gbrain",
  zoteroKey: "",
  pdfKey: "",
  pdfFile: "",
  page: 0,
  citeLabel: "Williamson 2021 Fire Aerosol",
  gbrainSlug: GBRAIN_REF.slug,
  supports: null,
  threadId: null,
  provider: null,
};

describe("PassageCard", () => {
  afterEach(cleanup);
  beforeEach(() => {
    send.mockClear();
    errorToast.mockClear();
    resetEvidencePinsForTests();
  });

  it("repliée : une ligne, citation tronquée, cite + page", () => {
    render(<PassageCard refData={REF} />);
    expect(screen.getByText(/Williamson/)).toBeTruthy();
    expect(document.querySelector(".passage-card.open")).toBeNull();
  });

  it("dépliée au clic : citation complète + actions", () => {
    render(<PassageCard refData={REF} />);
    fireEvent.click(screen.getByRole("button", { name: /déplier|expand/i }));
    expect(document.querySelector(".passage-card.open")).toBeTruthy();
  });

  it("lien passage SEUL dans un paragraphe → carte ; inline → pilule", () => {
    const md = `Avant.\n\n[« q »](#atelier-zotero-passage?key=A1&pdfKey=B2&file=a.pdf&page=7&quote=q)\n\nEt [inline](#atelier-zotero-passage?key=A1&pdfKey=B2&file=a.pdf&page=7&quote=q) ici.`;
    render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
    expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
    expect(document.querySelectorAll(".zotero-passage-ref")).toHaveLength(1);
  });

  it("épingler envoie pinPassage avec le projectRoot connu du store", () => {
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [] });
    render(<PassageCard refData={REF} />);
    fireEvent.click(screen.getByRole("button", { name: /épingler|pin/i }));
    expect(send).toHaveBeenCalledWith({
      type: "pinPassage",
      projectRoot: "/proj/a",
      pin: {
        quote: REF.quote,
        zoteroKey: REF.key,
        pdfKey: REF.pdfKey,
        pdfFile: REF.pdfFile,
        page: REF.page,
        citeLabel: "Williamson et al. 2021",
      },
    });
  });

  it("sans projectRoot connu, le clic épingler n'envoie rien", () => {
    render(<PassageCard refData={REF} />);
    fireEvent.click(screen.getByRole("button", { name: /épingler|pin/i }));
    expect(send).not.toHaveBeenCalled();
  });

  it("épinglée : icône accent, et le clic envoie unpinPassage", () => {
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [PIN1] });
    render(<PassageCard refData={REF} />);
    const pinButton = screen.getByRole("button", { name: /retirer l'épingle|unpin/i });
    expect(pinButton.className).toContain("is-pinned");
    fireEvent.click(pinButton);
    expect(send).toHaveBeenCalledWith({ type: "unpinPassage", projectRoot: "/proj/a", pinId: "pin1" });
  });

  it("erreur WS sur evidencePins : toast affiché, l'état de la carte ne change pas", () => {
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [PIN1] });
    render(<PassageCard refData={REF} />);
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [], error: "boom" });
    expect(errorToast).toHaveBeenCalledWith("boom");
    // toujours épinglée : l'erreur n'a pas vidé la liste de pins du store
    expect(screen.getByRole("button", { name: /retirer l'épingle|unpin/i })).toBeTruthy();
  });

  // ---- source gbrain (tâche 6) --------------------------------------------

  it("lien gbrain seul → carte ; ouverture = lecteur avec citation", () => {
    const md = `[« q »](#atelier-gbrain-passage?slug=williamson-2021-fire-aerosol&quote=Fire%20aerosol)`;
    render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
    expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
  });

  it("lien gbrain SEUL dans un paragraphe → carte ; inline → pilule", () => {
    const md = `Avant.\n\n[« q »](#atelier-gbrain-passage?slug=s&quote=q)\n\nEt [inline](#atelier-gbrain-passage?slug=s&quote=q) ici.`;
    render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
    expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
    expect(document.querySelectorAll(".gbrain-passage-ref")).toHaveLength(1);
  });

  // Arbitrage contrôleur (post-revue) : slug hiérarchique réel (papers/…)
  it("lien gbrain à slug hiérarchique (papers/acp-19-1393-2019) → carte rendue", () => {
    const md = `[« q »](#atelier-gbrain-passage?slug=papers%2Facp-19-1393-2019&quote=q)`;
    render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
    expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
  });

  it("carte gbrain repliée : libellé = slug humanisé, pas de « p. N »", () => {
    render(<PassageCard refData={GBRAIN_REF} />);
    expect(screen.getByText("Williamson 2021 Fire Aerosol")).toBeTruthy();
    expect(screen.queryByText(/p\. \d/)).toBeNull();
  });

  it("carte gbrain dépliée : l'action ouvre le lecteur (kb-open-gbrain-passage), pas un PDF", () => {
    const handler = vi.fn();
    window.addEventListener("kb-open-gbrain-passage", handler);
    render(<PassageCard refData={GBRAIN_REF} />);
    fireEvent.click(screen.getByRole("button", { name: /déplier|expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /lire|read/i }));
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: GBRAIN_REF.slug, quote: GBRAIN_REF.quote });
    window.removeEventListener("kb-open-gbrain-passage", handler);
  });

  it("épingler un passage gbrain envoie pinPassage avec source/gbrainSlug (pas de champs zotero)", () => {
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [] });
    render(<PassageCard refData={GBRAIN_REF} />);
    fireEvent.click(screen.getByRole("button", { name: /épingler|pin/i }));
    expect(send).toHaveBeenCalledWith({
      type: "pinPassage",
      projectRoot: "/proj/a",
      pin: {
        source: "gbrain",
        quote: GBRAIN_REF.quote,
        gbrainSlug: GBRAIN_REF.slug,
        citeLabel: "Williamson 2021 Fire Aerosol",
      },
    });
  });

  it("passage gbrain déjà épinglé : icône accent, et le clic envoie unpinPassage", () => {
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [GBRAIN_PIN1] });
    render(<PassageCard refData={GBRAIN_REF} />);
    const pinButton = screen.getByRole("button", { name: /retirer l'épingle|unpin/i });
    expect(pinButton.className).toContain("is-pinned");
    fireEvent.click(pinButton);
    expect(send).toHaveBeenCalledWith({ type: "unpinPassage", projectRoot: "/proj/a", pinId: "gpin1" });
  });

  it("un passage zotero et un passage gbrain de même quote ne se confondent pas", () => {
    const sameQuote: GbrainPassageRef = { kind: "gbrain", slug: "autre-slug", quote: REF.quote };
    pushEvidencePins({ type: "evidencePins", projectRoot: "/proj/a", pins: [PIN1] });
    render(<PassageCard refData={sameQuote} />);
    // le pin zotero (PIN1) porte la même quote mais une autre source : pas épinglé
    expect(screen.getByRole("button", { name: /épingler|pin/i })).toBeTruthy();
  });

  // ---- fiche deux lignes (plan 066) ---------------------------------------

  it("citation vide ne casse pas la carte repliée", () => {
    const emptyQuoteRef: ZoteroPassageRef = { ...REF, quote: "" };
    const { container } = render(<PassageCard refData={emptyQuoteRef} />);
    const quoteEl = container.querySelector(".passage-card-quote");
    expect(quoteEl?.classList.contains("is-absent")).toBe(true);
    expect(quoteEl?.textContent).toMatch(/Williamson et al\. 2021/);
    expect(quoteEl?.textContent?.trim()).not.toBe("");
    expect(document.querySelector(".passage-card.open")).toBeNull();
  });
});
