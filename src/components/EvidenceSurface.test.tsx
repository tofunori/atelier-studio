import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EvidenceSurface from "./EvidenceSurface";
import { pushEvidencePins, resetEvidencePinsForTests, type EvidencePin } from "../lib/evidencePins";

const send = vi.fn((_message: unknown) => true);
vi.mock("../lib/wsBus", () => ({ wsSend: (message: unknown) => send(message) }));
const successToast = vi.fn(async (_message: string) => {});
vi.mock("./ui/toast", () => ({ showSuccess: (message: string) => successToast(message) }));

let idCounter = 0;
let tsCounter = 1000;

function makePin(overrides: Partial<EvidencePin> = {}): EvidencePin {
  idCounter += 1;
  tsCounter += 1;
  return {
    id: `pin${idCounter}`,
    ts: tsCounter,
    quote: `Citation ${idCounter} — un passage assez long pour vérifier l'ellipsis.`,
    source: "zotero",
    zoteroKey: `ZKEY${idCounter}`,
    pdfKey: `PDFKEY${idCounter}`,
    pdfFile: `article-${idCounter}.pdf`,
    page: 7,
    citeLabel: `Auteur ${idCounter} 2024`,
    gbrainSlug: null,
    supports: null,
    threadId: null,
    provider: null,
    ...overrides,
  };
}

function pinWithSupports(text: string, overrides: Partial<EvidencePin> = {}): EvidencePin {
  return makePin({ supports: { text, file: "intro.tex", lines: "L42" }, ...overrides });
}

function pinSansSupports(overrides: Partial<EvidencePin> = {}): EvidencePin {
  return makePin({ supports: null, ...overrides });
}

function seedEvidencePins(pins: EvidencePin[]) {
  pushEvidencePins({ type: "evidencePins", projectRoot: "/proj", pins });
}

describe("EvidenceSurface", () => {
  afterEach(cleanup);
  beforeEach(() => {
    send.mockClear();
    successToast.mockClear();
    resetEvidencePinsForTests();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it("groupe par phrase appuyée, « Sans ancrage » en dernier", () => {
    seedEvidencePins([pinWithSupports("Phrase A"), pinWithSupports("Phrase A"), pinSansSupports()]);
    render(<EvidenceSurface projectRoot="/proj" />);
    const groups = screen.getAllByTestId("evidence-group");
    expect(groups).toHaveLength(2);
    expect(groups[1].textContent).toMatch(/Sans ancrage|No anchor/);
  });

  it("rangée : clic ouvre le PDF, action retire l'épingle", () => {
    const pin = pinWithSupports("Phrase A");
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    fireEvent.click(screen.getByText(/p\. 7/));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat-open-zotero-passage" }),
    );
    dispatchSpy.mockRestore();

    fireEvent.click(screen.getByRole("button", { name: /retirer l'épingle|unpin/i }));
    expect(send).toHaveBeenCalledWith({ type: "unpinPassage", projectRoot: "/proj", pinId: pin.id });
  });

  it("état vide : EmptyState avec le message dédié", () => {
    seedEvidencePins([]);
    render(<EvidenceSurface projectRoot="/proj" />);
    expect(screen.getByText(/Aucun passage épinglé|No pinned passages/)).toBeTruthy();
  });

  // Revue finale de branche, finding 2 : file/lines sont Option côté Rust
  // (l'un peut être absent sans l'autre) — la légende de groupe ne doit
  // jamais afficher un « · » pendouillant entre un segment présent et un
  // segment absent.
  it("légende de groupe : file sans lines → « intro.tex » sans séparateur pendouillant", () => {
    const pin = makePin({ supports: { text: "Phrase B", file: "intro.tex", lines: null } });
    seedEvidencePins([pin]);
    const { container } = render(<EvidenceSurface projectRoot="/proj" />);
    const loc = container.querySelector(".evidence-group-loc");
    expect(loc?.textContent).toBe("intro.tex");
  });

  it("légende de groupe : lines sans file → « L42 » sans séparateur pendouillant", () => {
    const pin = makePin({ supports: { text: "Phrase C", file: null, lines: "L42" } });
    seedEvidencePins([pin]);
    const { container } = render(<EvidenceSurface projectRoot="/proj" />);
    const loc = container.querySelector(".evidence-group-loc");
    expect(loc?.textContent).toBe("L42");
  });

  it("groupes triés par ajout desc — le groupe le plus récemment complété passe en premier", () => {
    const older = pinWithSupports("Phrase ancienne");
    const newer = pinWithSupports("Phrase récente");
    seedEvidencePins([older, newer]);
    render(<EvidenceSurface projectRoot="/proj" />);
    const groups = screen.getAllByTestId("evidence-group");
    expect(groups[0].textContent).toContain("Phrase récente");
    expect(groups[1].textContent).toContain("Phrase ancienne");
  });

  it("rangée gbrain : libellé = citeLabel stocké, pas de « p. N »", () => {
    const pin = pinSansSupports({
      source: "gbrain",
      gbrainSlug: "williamson-2021-fire-aerosol",
      citeLabel: "Williamson 2021 Fire Aerosol",
      quote: "Fire aerosol deposition réduit l'albédo estival des glaciers.",
    });
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    expect(screen.getByText("Williamson 2021 Fire Aerosol")).toBeTruthy();
    expect(screen.queryByText(/p\.\s*\d/)).toBeNull();
  });

  it("rangée gbrain : clic ouvre le lecteur (kb-open-gbrain-passage), pas un PDF", () => {
    const pin = pinSansSupports({
      source: "gbrain",
      gbrainSlug: "s-1",
      citeLabel: "S 1",
      quote: "Une citation gbrain précise.",
    });
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    const handler = vi.fn();
    window.addEventListener("kb-open-gbrain-passage", handler);
    fireEvent.click(screen.getByText(pin.quote));
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: "s-1", quote: pin.quote });
    window.removeEventListener("kb-open-gbrain-passage", handler);
  });

  it("copier \\autocite (zotero) : presse-papiers + toast succès", async () => {
    const pin = pinWithSupports("Phrase A");
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    fireEvent.click(screen.getByRole("button", { name: /autocite/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`\\autocite{${pin.zoteroKey}}`);
  });

  it("copier la citation (gbrain) : presse-papiers avec la citation brute", () => {
    const pin = pinSansSupports({
      source: "gbrain",
      gbrainSlug: "s-1",
      citeLabel: "S 1",
      quote: "Une citation gbrain précise.",
    });
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    fireEvent.click(screen.getByRole("button", { name: /copier la citation|copy citation/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(pin.quote);
  });

  it("pas de bouton « autocite » sur une rangée gbrain", () => {
    const pin = pinSansSupports({ source: "gbrain", gbrainSlug: "s-1", citeLabel: "S 1" });
    seedEvidencePins([pin]);
    render(<EvidenceSurface projectRoot="/proj" />);
    expect(screen.queryByRole("button", { name: /autocite/i })).toBeNull();
  });

  // Fix revue T7 : AtelierPane est monté avec key={activeProject} — un
  // changement de projet le remonte EN ENTIER, y compris un onglet Preuves
  // déjà ouvert. Si le composant redemandait lui-même listPins au montage,
  // ça ferait DEUX sends pour un seul changement de projet (App.tsx en
  // envoie déjà un). Le composant ne doit donc jamais envoyer listPins
  // lui-même — seul App.tsx en est responsable.
  it("bascule de projet avec onglet Preuves déjà ouvert (remontage) : le composant n'envoie jamais lui-même listPins", () => {
    const first = render(<EvidenceSurface projectRoot="/proj-a" />);
    first.unmount();
    render(<EvidenceSurface projectRoot="/proj-b" />);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "listPins" }));
  });
});
