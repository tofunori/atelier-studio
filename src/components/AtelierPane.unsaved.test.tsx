// Audit 2026-10-18, problème 1 : l'app connaît l'état « modifié » des
// éditeurs, demande confirmation avant de fermer un onglet modifié, et
// recibler une ligne d'un fichier ouvert ne recharge plus son iframe.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { UnsavedDocumentsGuard } from "./UnsavedDocumentsGuard";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
import { setLanguage, t } from "../lib/i18n";
import { isDocumentUnsaved, resetUnsavedDocumentsForTests } from "../lib/unsavedDocuments";

const ROOT = "/tmp/atelier-unsaved-test";
const ORIGIN = "http://127.0.0.1:19991";
const MAIN_URL = `${ORIGIN}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${ROOT}/main.tex`)}`;
const TABS: AtelierTab[] = [{ id: "main", title: "main.tex", url: MAIN_URL }];

function renderPane(tabs: AtelierTab[] = TABS) {
  const props: Parameters<typeof AtelierPane>[0] = {
    url: `${ORIGIN}/index.html`,
    projectRoot: ROOT,
    activeThreadId: null,
    ws: null,
    files: ["main.tex"],
    onOpenFile: vi.fn(),
    onPinTab: vi.fn(),
    onColorTab: vi.fn(),
    onReorderTabs: vi.fn(),
    tabs,
    activeTab: "main",
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onActiveSurfaceChange: vi.fn(),
    reloadKey: 0,
    showExplorer: false,
    recentFiles: [],
    onOpenExplorer: vi.fn(),
    layout: "split",
    onToggleExpand: vi.fn(),
  };
  const view = (next: AtelierTab[]) => (
    <><WorkspacePaneMenuSlot /><UnsavedDocumentsGuard /><AtelierPane {...props} tabs={next} /></>
  );
  const result = render(view(tabs));
  return { props, ...result, setTabs: (next: AtelierTab[]) => result.rerender(view(next)) };
}

function documentFrame(container: HTMLElement) {
  return container.querySelector<HTMLIFrameElement>('iframe[data-atelier-tab="main"]')!;
}

function fromFrame(frame: HTMLIFrameElement, data: unknown, origin = ORIGIN) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: frame.contentWindow }));
  });
}

/** L'éditeur de l'iframe répond aux demandes de l'app comme le vrai gardien. */
function answerRequests(frame: HTMLIFrameElement) {
  return vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((message: unknown) => {
    const type = (message as { type?: string }).type;
    const ack = type === "atelier-discard-draft" ? "atelier-draft-discarded"
      : type === "atelier-flush-draft" ? "atelier-draft-flushed" : null;
    if (ack) queueMicrotask(() => fromFrame(frame, { type: ack }));
  });
}

describe("AtelierPane — documents non enregistrés", () => {
  beforeEach(() => {
    setLanguage("fr");
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    resetUnsavedDocumentsForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("n'accepte l'état « modifié » que de l'iframe du document, à son origine", () => {
    const { container } = renderPane();
    const frame = documentFrame(container);
    fromFrame(frame, { type: "atelier-dirty", dirty: true, path: `${ROOT}/main.tex` }, "https://ailleurs.example");
    expect(isDocumentUnsaved("main")).toBe(false);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "atelier-dirty", dirty: true }, origin: ORIGIN, source: window }));
    });
    expect(isDocumentUnsaved("main")).toBe(false);
    fromFrame(frame, { type: "atelier-dirty", dirty: true, path: `${ROOT}/main.tex` });
    expect(isDocumentUnsaved("main")).toBe(true);
    fromFrame(frame, { type: "atelier-dirty", dirty: false, path: `${ROOT}/main.tex` });
    expect(isDocumentUnsaved("main")).toBe(false);
  });

  it("ferme sans question un document enregistré", async () => {
    const { props } = renderPane();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("workspace-close-tab", { detail: { id: "document:main" } }));
    });
    expect(props.onCloseTab).toHaveBeenCalledWith("main");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("demande confirmation avant de fermer un document modifié", async () => {
    const { container, props } = renderPane();
    const frame = documentFrame(container);
    const posted = answerRequests(frame);
    fromFrame(frame, { type: "atelier-dirty", dirty: true, path: `${ROOT}/main.tex` });

    await act(async () => {
      window.dispatchEvent(new CustomEvent("workspace-close-tab", { detail: { id: "document:main" } }));
    });
    expect(await screen.findByText(t("unsaved.close-title", { name: "main.tex" }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("action.cancel") }));
    await waitFor(() => expect(screen.queryByText(t("unsaved.close-title", { name: "main.tex" }))).toBeNull());
    expect(props.onCloseTab).not.toHaveBeenCalled();
    expect(isDocumentUnsaved("main")).toBe(true);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("workspace-close-tab", { detail: { id: "document:main" } }));
    });
    fireEvent.click(await screen.findByRole("button", { name: t("unsaved.close-confirm") }));
    await waitFor(() => expect(props.onCloseTab).toHaveBeenCalledWith("main"));
    expect(posted).toHaveBeenCalledWith({ type: "atelier-discard-draft" }, ORIGIN);
    expect(isDocumentUnsaved("main")).toBe(false);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/draft`, expect.objectContaining({
      body: JSON.stringify({ path: `${ROOT}/main.tex`, clear: true }),
    })));
  });

  it("recibler une ligne garde la page de l'iframe et lui envoie la ligne", () => {
    const { container, setTabs } = renderPane();
    const frame = documentFrame(container);
    fireEvent.load(frame);
    const posted = vi.spyOn(frame.contentWindow!, "postMessage");
    setTabs([{ ...TABS[0], url: `${MAIN_URL}&line=42` }]);
    expect(documentFrame(container)).toBe(frame);
    expect(frame.getAttribute("src")).toBe(MAIN_URL);
    expect(posted).toHaveBeenCalledWith({ type: "atelier-goto-line", line: "42" }, ORIGIN);
  });

  it("un vrai rechargement d'un document modifié attend son brouillon", async () => {
    const { container, setTabs } = renderPane();
    const frame = documentFrame(container);
    fireEvent.load(frame);
    let flushed: () => void = () => {};
    vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((message: unknown) => {
      if ((message as { type?: string }).type === "atelier-flush-draft") {
        flushed = () => fromFrame(frame, { type: "atelier-draft-flushed" });
      }
    });
    fromFrame(frame, { type: "atelier-dirty", dirty: true, path: `${ROOT}/main.tex` });
    setTabs([{ ...TABS[0], url: `${MAIN_URL}&diff=1` }]);
    expect(frame.getAttribute("src"), "rechargement retenu").toBe(MAIN_URL);
    await act(async () => { flushed(); });
    await waitFor(() => expect(documentFrame(container).getAttribute("src")).toBe(`${MAIN_URL}&diff=1`));
  });
});
