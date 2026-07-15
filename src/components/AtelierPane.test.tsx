import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import AtelierPane, { relFromTabUrl } from "./AtelierPane";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({}) }));

describe("AtelierPane", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("retrouve le chemin projet d'un onglet SVG editor", () => {
    expect(relFromTabUrl(
      "http://127.0.0.1:18790/.fig_thumbs/svg_viewer.html?file=figures%2Fplot.svg",
      "/tmp/projet",
      "http://127.0.0.1:18790/",
    )).toBe("figures/plot.svg");
  });

  it("retire tous ses listeners window à l'unmount (plus de fuite useState)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <AtelierPane
        url="http://127.0.0.1:18790/"
        projectRoot="/tmp/projet"
        activeThreadId={null}
        ws={null}
        files={[]}
        onOpenFile={() => {}}
        onPinTab={() => {}}
        onColorTab={() => {}}
        onReorderTabs={() => {}}
        tabs={[]}
        activeTab=""
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        reloadKey={0}
        showExplorer={false}
        recentFiles={[]}
        onOpenExplorer={() => {}}
        layout="split"
        onToggleExpand={() => {}}
      />,
    );

    const added = addSpy.mock.calls.map(([type, handler]) => [type, handler] as const);
    expect(added.some(([type]) => type === "switch-surface")).toBe(true);
    expect(added.some(([type]) => type === "click")).toBe(false);

    unmount();

    const removedHandlers = new Set(removeSpy.mock.calls.map(([, handler]) => handler));
    for (const [type, handler] of added) {
      expect(removedHandlers.has(handler), `listener "${type}" doit être retiré à l'unmount`).toBe(true);
    }
  });

  it("utilise les Skeleton shadcn pendant le chargement de la galerie", () => {
    const { container } = render(
      <AtelierPane
        url="http://127.0.0.1:18790/"
        projectRoot="/tmp/projet"
        activeThreadId={null}
        ws={null}
        files={[]}
        onOpenFile={() => {}}
        onPinTab={() => {}}
        onColorTab={() => {}}
        onReorderTabs={() => {}}
        tabs={[]}
        activeTab="gallery"
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        reloadKey={0}
        showExplorer={false}
        recentFiles={[]}
        onOpenExplorer={() => {}}
        layout="split"
        onToggleExpand={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="gallery-skeleton"]')).toBeInTheDocument();
    expect(container.querySelector('.gallery-skeleton-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.gallery-skeleton-subbar')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);
  });
});
