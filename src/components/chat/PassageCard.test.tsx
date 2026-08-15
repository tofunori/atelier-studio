import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactMarkdown from "react-markdown";
import { PassageCard } from "./PassageCard";
import { MD_COMPONENTS, type ZoteroPassageRef } from "./md";
import { pushEvidencePins, resetEvidencePinsForTests } from "../../lib/evidencePins";

const send = vi.fn((_message: unknown) => true);
vi.mock("../../lib/wsBus", () => ({ wsSend: (message: unknown) => send(message) }));
const errorToast = vi.fn(async (_message: string) => {});
vi.mock("../ui/toast", () => ({ showError: (message: string) => errorToast(message) }));

const REF: ZoteroPassageRef = {
  key: "ABCD1234",
  pdfKey: "PDFKEY01",
  pdfFile: "Williamson et al. - 2021 - Ice sheet response to warming.pdf",
  page: 42,
  quote:
    "Un passage assez long pour vérifier que la troncature visuelle par ellipsis CSS ne casse rien à l'affichage replié de la carte.",
};

const PIN1 = {
  id: "pin1",
  ts: 1,
  quote: REF.quote,
  zoteroKey: REF.key,
  pdfKey: REF.pdfKey,
  pdfFile: REF.pdfFile,
  page: REF.page,
  citeLabel: "Williamson et al. 2021",
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
});
