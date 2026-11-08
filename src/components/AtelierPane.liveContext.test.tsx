// Contexte vivant (2026-11-08) : AtelierPane n'accepte atelier-live-context
// que de l'iframe du document, à son origine et avec son nonce, garde le
// dernier contexte par onglet et publie celui de l'onglet ACTIF du pane
// FOCALISÉ (null pour une surface, un onglet fermé, un pane démonté).
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
import { setLanguage } from "../lib/i18n";
import { LIVE_CONTEXT_EVENT, type LiveContext } from "../lib/liveContext";
import { resetUnsavedDocumentsForTests } from "../lib/unsavedDocuments";

const ROOT = "/tmp/atelier-live-test";
const ORIGIN = "http://127.0.0.1:19992";
const NONCE = "n0nce";
const tabUrl = (name: string) =>
  `${ORIGIN}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(`${ROOT}/${name}`)}#atelier_nonce=${NONCE}`;
const MAIN: AtelierTab = { id: "main", title: "main.tex", url: tabUrl("main.tex") };
const OTHER: AtelierTab = { id: "other", title: "other.tex", url: tabUrl("other.tex") };
const CTX = { path: `${ROOT}/main.tex`, name: "main.tex", kind: "tex", lineFrom: 3, lineTo: 5, selection: "a\nb\nc" };

let published: (LiveContext | null)[] = [];
const onPublish = (event: Event) => published.push((event as CustomEvent).detail.context);
const latest = () => published[published.length - 1];

function renderPane(tabs: AtelierTab[], activeTab = tabs[0].id) {
  const props: Parameters<typeof AtelierPane>[0] = {
    url: `${ORIGIN}/index.html`, projectRoot: ROOT, activeThreadId: null, ws: null,
    files: [], onOpenFile: vi.fn(), onPinTab: vi.fn(), onColorTab: vi.fn(), onReorderTabs: vi.fn(),
    tabs, activeTab, onSelectTab: vi.fn(), onCloseTab: vi.fn(), onActiveSurfaceChange: vi.fn(),
    reloadKey: 0, showExplorer: false, recentFiles: [], onOpenExplorer: vi.fn(),
    layout: "split", onToggleExpand: vi.fn(),
  };
  const view = (next: AtelierTab[], active: string) => (
    <><WorkspacePaneMenuSlot /><AtelierPane {...props} tabs={next} activeTab={active} /></>
  );
  const result = render(view(tabs, activeTab));
  return { ...result, update: (next: AtelierTab[], active: string) => result.rerender(view(next, active)) };
}

const frameOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLIFrameElement>(`iframe[data-atelier-tab="${id}"]`)!;

function post(frame: HTMLIFrameElement, data: Record<string, unknown>, origin = ORIGIN) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", {
      data: { nonce: NONCE, ...data }, origin, source: frame.contentWindow,
    }));
  });
}

describe("AtelierPane — contexte vivant", () => {
  beforeEach(() => {
    setLanguage("fr");
    localStorage.clear();
    published = [];
    window.addEventListener(LIVE_CONTEXT_EVENT, onPublish);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    window.removeEventListener(LIVE_CONTEXT_EVENT, onPublish);
    resetUnsavedDocumentsForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("n'accepte que l'iframe du document, à son origine, avec son nonce", () => {
    const { container } = renderPane([MAIN]);
    const frame = frameOf(container, "main");
    post(frame, { type: "atelier-live-context", context: CTX }, "https://ailleurs.example");
    post(frame, { type: "atelier-live-context", context: CTX, nonce: "faux" });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "atelier-live-context", context: CTX, nonce: NONCE }, origin: ORIGIN, source: window,
      }));
    });
    expect(published.filter(Boolean)).toHaveLength(0);
    post(frame, { type: "atelier-live-context", context: CTX });
    expect(latest()).toMatchObject({ path: `${ROOT}/main.tex`, lineFrom: 3, lineTo: 5, selection: "a\nb\nc" });
    post(frame, { type: "atelier-live-context", context: null });
    expect(latest()).toBeNull();
  });

  it("publie le contexte de l'onglet actif, garde celui des autres, l'oublie à la fermeture", () => {
    const { container, update } = renderPane([MAIN, OTHER], "main");
    post(frameOf(container, "main"), { type: "atelier-live-context", context: CTX });
    post(frameOf(container, "other"), {
      type: "atelier-live-context", context: { path: `${ROOT}/other.tex`, name: "other.tex", kind: "tex", line: 9 },
    });
    // l'onglet « other » n'est pas actif : son contexte est gardé, pas publié
    expect(latest()).toMatchObject({ name: "main.tex" });
    update([MAIN, OTHER], "other");
    expect(latest()).toMatchObject({ name: "other.tex", line: 9 });
    update([MAIN, OTHER], "main");
    expect(latest()).toMatchObject({ name: "main.tex", lineFrom: 3 });
    // fermeture de « main » : son contexte disparaît, rien de périmé ne reste publié
    update([OTHER], "other");
    expect(latest()).toMatchObject({ name: "other.tex" });
    update([MAIN, OTHER], "main");
    expect(latest()).toBeNull();
  });

  it("un pane démonté ne laisse aucun contexte derrière lui", () => {
    const { container, unmount } = renderPane([MAIN]);
    post(frameOf(container, "main"), { type: "atelier-live-context", context: CTX });
    expect(latest()).not.toBeNull();
    unmount();
    expect(latest()).toBeNull();
  });
});
