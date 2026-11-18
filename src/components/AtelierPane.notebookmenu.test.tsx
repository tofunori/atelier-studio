import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import AtelierPane, { type AtelierTab } from "./AtelierPane";
import { WorkspacePaneMenuSlot } from "./WorkspacePaneMenuSlot";
import { setLanguage, t } from "../lib/i18n";

// L'onglet cahier réel parle au noyau ; ici seul son bouton de pane compte.
vi.mock("./NotebookTab", () => ({
  default: (p: { paneControls?: ReactNode }) => <div data-testid="nb">{p.paneControls}</div>,
}));

const ROOT = "/tmp/atelier-nb-menu";
const ORIGIN = "http://127.0.0.1:19990";
const TABS: AtelierTab[] = [{
  id: "nb",
  title: "essai.ipynb",
  url: `${ORIGIN}/.fig_thumbs/ipynb_studio.html?path=${encodeURIComponent(`${ROOT}/essai.ipynb`)}`,
}];

beforeEach(() => { localStorage.clear(); setLanguage("fr"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AtelierPane — bouton de pane d'un cahier", () => {
  it("un clic sur le bouton du cahier n'ouvre qu'un seul menu (pas aussi celui du clic droit)", async () => {
    render(<><WorkspacePaneMenuSlot /><AtelierPane
      url={`${ORIGIN}/index.html`} projectRoot={ROOT} activeThreadId={null} ws={null}
      files={["essai.ipynb"]} onOpenFile={vi.fn()} onPinTab={vi.fn()} onColorTab={vi.fn()}
      onReorderTabs={vi.fn()} tabs={TABS} activeTab="nb" onSelectTab={vi.fn()} onCloseTab={vi.fn()}
      onActiveSurfaceChange={vi.fn()} reloadKey={0} showExplorer={false} recentFiles={[]}
      onOpenExplorer={vi.fn()} layout="split" onToggleExpand={vi.fn()}
    /></>);
    const nb = await screen.findByTestId("nb");
    const button = nb.querySelector<HTMLButtonElement>("button")!;
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    fireEvent.click(button);
    expect(await screen.findAllByRole("menuitem", { name: t("workspace.split-right") })).toHaveLength(1);
    expect(document.querySelectorAll("[role=menu]")).toHaveLength(1);
  });
});
