import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmDiscard,
  answerDiscard,
  discardServerDraft,
  editorDraftTarget,
  isDocumentUnsaved,
  lineOnlyChange,
  pruneUnsavedDocuments,
  reconcileFrameSource,
  requestFrame,
  resetUnsavedDocumentsForTests,
  setDocumentUnsaved,
  subscribeDiscardRequests,
  subscribeUnsavedDocuments,
  unsavedDocuments,
} from "./unsavedDocuments";

const ORIGIN = "http://127.0.0.1:19990";
const LATEX = `${ORIGIN}/.fig_thumbs/latex_studio.html?path=%2Fp%2Fmain.tex`;
const doc = { tabId: "t1", title: "main.tex", path: "/p/main.tex", url: LATEX };

afterEach(() => resetUnsavedDocumentsForTests());

describe("documents non enregistrés", () => {
  it("garde un document modifié jusqu'à ce qu'il redevienne propre ou que son onglet disparaisse", () => {
    const changes = vi.fn();
    subscribeUnsavedDocuments(changes);
    setDocumentUnsaved(doc, true);
    setDocumentUnsaved(doc, true);
    expect(isDocumentUnsaved("t1")).toBe(true);
    expect(changes).toHaveBeenCalledTimes(1);
    setDocumentUnsaved(doc, false);
    expect(unsavedDocuments()).toEqual([]);
    setDocumentUnsaved(doc, true);
    pruneUnsavedDocuments(new Set(["autre"]));
    expect(isDocumentUnsaved("t1")).toBe(false);
  });

  it("ne jette jamais en silence : sans dialogue monté, la confirmation est refusée", async () => {
    await expect(confirmDiscard("close", [doc])).resolves.toBe(false);
    await expect(confirmDiscard("close", [])).resolves.toBe(true);
  });

  it("la confirmation passe par le dialogue, et une seconde demande refuse la première", async () => {
    const requests: unknown[] = [];
    subscribeDiscardRequests((request) => requests.push(request));
    const first = confirmDiscard("close", [doc]);
    const second = confirmDiscard("quit", [doc]);
    await expect(first).resolves.toBe(false);
    answerDiscard(true);
    await expect(second).resolves.toBe(true);
    expect(requests).toEqual([
      { kind: "close", documents: [doc] },
      { kind: "quit", documents: [doc] },
      null,
    ]);
  });
});

describe("cible du brouillon de secours", () => {
  it("ne vise que les éditeurs, à l'origine du serveur galerie", () => {
    expect(editorDraftTarget(LATEX)).toEqual({ origin: ORIGIN, path: "/p/main.tex" });
    expect(editorDraftTarget(`${ORIGIN}/.fig_thumbs/pdf_viewer.html?file=a.pdf`)).toBeNull();
    expect(editorDraftTarget("pas une url")).toBeNull();
  });

  it("efface le brouillon côté serveur", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(discardServerDraft(LATEX, fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(`${ORIGIN}/draft`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "/p/main.tex", clear: true }),
    }));
  });
});

describe("source de l'iframe d'un onglet", () => {
  it("ne recharge pas quand seule la ligne change", () => {
    expect(lineOnlyChange(LATEX, `${LATEX}&line=12`)).toBe("12");
    expect(lineOnlyChange(`${LATEX}&line=12`, LATEX)).toBe("");
    expect(lineOnlyChange(LATEX, `${LATEX}&diff=1`)).toBeNull();
    expect(lineOnlyChange(LATEX, LATEX.replace("main.tex", "other.tex"))).toBeNull();
    const first = reconcileFrameSource(undefined, LATEX);
    expect(first).toEqual({ source: { src: LATEX, url: LATEX }, gotoLine: null, reload: false });
    const goto = reconcileFrameSource(first.source, `${LATEX}&line=12`);
    expect(goto).toEqual({ source: { src: LATEX, url: `${LATEX}&line=12` }, gotoLine: "12", reload: false });
    const again = reconcileFrameSource(goto.source, `${LATEX}&line=40`);
    expect(again.source.src).toBe(LATEX);
    expect(again.gotoLine).toBe("40");
  });

  it("recharge un changement réel, ou une iframe encore en chargement", () => {
    const first = reconcileFrameSource(undefined, LATEX).source;
    expect(reconcileFrameSource(first, `${LATEX}&diff=1`)).toEqual({
      source: { src: `${LATEX}&diff=1`, url: `${LATEX}&diff=1` }, gotoLine: null, reload: true,
    });
    expect(reconcileFrameSource(first, `${LATEX}&line=3`, false).reload).toBe(true);
  });

  it("un rechargement retenu suit la dernière URL demandée", () => {
    const held = { src: LATEX, url: `${LATEX}&diff=1`, pendingSrc: `${LATEX}&diff=1` };
    expect(reconcileFrameSource(held, `${LATEX}&diff=1&line=4`).source).toEqual({
      src: LATEX, url: `${LATEX}&diff=1&line=4`, pendingSrc: `${LATEX}&diff=1&line=4`,
    });
  });
});

describe("demandes à l'éditeur d'une iframe", () => {
  it("attend l'accusé de cette iframe seulement, ou abandonne après le délai", async () => {
    vi.useFakeTimers();
    try {
      const target = { postMessage: vi.fn() } as unknown as Window;
      const frame = { contentWindow: target, src: LATEX } as unknown as HTMLIFrameElement;
      const pending = requestFrame(frame, "atelier-flush-draft", "atelier-draft-flushed", 500);
      expect(target.postMessage).toHaveBeenCalledWith({ type: "atelier-flush-draft" }, ORIGIN);
      window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-draft-flushed" }, origin: "https://ailleurs.example", source: target as unknown as MessageEventSource }));
      window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-draft-flushed" }, origin: ORIGIN, source: target as unknown as MessageEventSource }));
      await expect(pending).resolves.toBe(true);
      const late = requestFrame(frame, "atelier-flush-draft", "atelier-draft-flushed", 500);
      vi.advanceTimersByTime(500);
      await expect(late).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
