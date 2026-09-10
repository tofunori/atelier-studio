import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const tauriCore = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => tauriCore);
import * as localImage from "@/lib/localImage";
vi.mock("./chat/WidgetFrame", () => ({
  WidgetFrame: ({
    event,
    threadId,
  }: {
    event: { id: string; title: string; height: number };
    threadId: string | null;
  }) => (
    <div data-testid="widget-frame" data-widget-id={event.id} data-thread-id={threadId ?? ""}>
      {event.title}
    </div>
  ),
}));
import {
  ATELIER_DATA_PART_NAMES,
  ATELIER_DATA_RENDERER_LIMITATIONS,
  AtelierEditData,
  AtelierImageData,
  AtelierPlanData,
  AtelierTodosData,
  AtelierWidgetData,
  type AssistantUiDataHost,
} from "./AssistantUiData";
import { isTauri } from "@tauri-apps/api/core";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const complete = {
  type: "complete" as const,
};

function dataProps(name: string, data: unknown) {
  return { type: "data" as const, name, data, status: complete };
}

describe("AssistantUiData", () => {
  it("registers the Atelier data-part names as one explicit allowlist", () => {
    expect(ATELIER_DATA_PART_NAMES).toEqual([
      "atelier-activity",
      "atelier-agent-message",
      "atelier-annotations",
      "atelier-attachments",
      "atelier-edit",
      "atelier-error",
      "atelier-goal",
      "atelier-image",
      "atelier-plan",
      "atelier-todos",
      "atelier-widget",
    ]);
    expect("widget" in ATELIER_DATA_RENDERER_LIMITATIONS).toBe(false);
  });

  it("projects plan and todo data through the official assistant-ui elements", () => {
    const view = render(
      <>
        <AtelierPlanData
          {...dataProps("atelier-plan", {
            markdown: "- [x] Lire\n- [ ] Vérifier",
          })}
        />
        <AtelierTodosData
          {...dataProps("atelier-todos", [
            { text: "Lire", completed: true },
            { text: "Vérifier", completed: false, active: true },
          ])}
        />
      </>,
    );
    expect(view.container.querySelector('[data-slot="atelier-plan"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-slot="atelier-todos"]')).toBeInTheDocument();
    expect(screen.getAllByText("Vérifier")).toHaveLength(2);
  });

  it("uses the host file callback for edit references and preserves diff metadata", () => {
    const onOpenFile = vi.fn();
    const host: AssistantUiDataHost = { onOpenFile };
    render(
      <AtelierEditData
        {...dataProps("atelier-edit", {
          baseSha: "abc123",
          files: [{ path: "src/App.tsx", add: 4, del: 2 }],
        })}
        host={host}
      />,
    );

    expect(screen.getByText("App.tsx")).toBeInTheDocument();
    expect(screen.getByText("+4 · −2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/App.tsx", {
      diff: true,
      baseSha: "abc123",
    });
  });

  it("keeps native image parts for URLs while routing local paths to the host", () => {
    const onOpenFile = vi.fn();
    const host: AssistantUiDataHost = { onOpenFile };
    const { rerender } = render(
      <AtelierImageData
        {...dataProps("atelier-image", {
          ref: "https://example.test/image.png",
          label: "figure",
        })}
        host={host}
      />,
    );
    expect(screen.getByRole("img", { name: "figure" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer dans la galerie" })).not.toBeInTheDocument();

    rerender(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "docs/figure.png" })}
        host={host}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(onOpenFile).toHaveBeenCalledWith("docs/figure.png", {
      diff: undefined,
      baseSha: undefined,
    });
  });

  it("does not offer gallery persistence for remote image references", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    render(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "https://example.test/image.png" })}
        host={{ threadId: "thread-9" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Enregistrer dans la galerie" })).not.toBeInTheDocument();
  });

  it("resolves a local image through the Atelier preview helper and revokes its blob URL", async () => {
    const preview = vi.spyOn(localImage, "localImagePreviewUrl").mockResolvedValue("blob:local-image");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "/tmp/figure.png", label: "figure" })}
        host={{}}
      />,
    );
    await waitFor(() => expect(screen.getByRole("img", { name: "figure" })).toBeInTheDocument());
    expect(preview).toHaveBeenCalledWith("/tmp/figure.png");
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:local-image");
  });

  it("saves a local image to the current thread gallery with visible success", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const save = vi.spyOn(localImage, "saveLocalImageToGallery").mockResolvedValue("/gallery/figure.png");
    vi.spyOn(localImage, "localImagePreviewUrl").mockResolvedValue("blob:gallery-image");
    render(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "/tmp/figure.png", label: "figure" })}
        host={{ threadId: "thread-9" }}
      />,
    );
    const button = await screen.findByRole("button", { name: "Enregistrer dans la galerie" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith("/tmp/figure.png", "thread-9"));
    expect(await screen.findByRole("status")).toHaveTextContent("Image ajoutée à la galerie.");
    expect(button).toBeDisabled();
  });

  it("keeps the gallery action unavailable without Tauri or a thread", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const { rerender } = render(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "/tmp/figure.png" })}
        host={{ threadId: "thread-9" }}
      />,
    );
    expect(await screen.findByRole("button", { name: "Enregistrer dans la galerie" })).toBeDisabled();
    vi.mocked(isTauri).mockReturnValue(true);
    rerender(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "/tmp/figure.png" })}
        host={{}}
      />,
    );
    expect(screen.getByRole("button", { name: "Enregistrer dans la galerie" })).toBeDisabled();
  });

  it("surfaces a gallery write failure without enabling a fake success", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.spyOn(localImage, "saveLocalImageToGallery").mockRejectedValue(new Error("gallery unavailable"));
    vi.spyOn(localImage, "localImagePreviewUrl").mockResolvedValue("blob:gallery-image");
    render(
      <AtelierImageData
        {...dataProps("atelier-image", { ref: "/tmp/figure.png" })}
        host={{ threadId: "thread-9" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Enregistrer dans la galerie" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("gallery unavailable");
  });

  it("passes widget identity and host thread id to the existing sidecar frame", () => {
    render(
      <AtelierWidgetData
        {...dataProps("atelier-widget", { id: "widget-7", title: "Preview", height: 240 })}
        host={{ threadId: "thread-9" }}
      />,
    );
    expect(screen.getByTestId("widget-frame")).toHaveAttribute("data-widget-id", "widget-7");
    expect(screen.getByTestId("widget-frame")).toHaveAttribute("data-thread-id", "thread-9");
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });
});
