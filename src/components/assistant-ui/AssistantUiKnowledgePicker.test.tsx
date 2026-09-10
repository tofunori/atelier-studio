import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  AssistantUiKnowledgePicker,
  filterKnowledgeSources,
} from "./AssistantUiKnowledgePicker";
import {
  openKbPicker,
  resetKbSourcesForTests,
  type KbBinding,
  type KbSource,
} from "@/lib/kbSources";
import { renderUi } from "@/test/render";

const actions = {
  error: null as string | null,
  setError: vi.fn(),
  promoted: null as string | null,
  toggle: vi.fn(),
  toggleFull: vi.fn(),
  removeSource: vi.fn(),
  removeMany: vi.fn(),
  promote: vi.fn(),
  addFiles: vi.fn(async () => undefined),
  addFolder: vi.fn(async () => undefined),
  addPdf: vi.fn(),
  addUrl: vi.fn(),
  addNote: vi.fn(),
  addGbrain: vi.fn(),
  createCollection: vi.fn(),
  tagSource: vi.fn(),
  archiveSource: vi.fn(),
  tagMany: vi.fn(),
  archiveMany: vi.fn(),
  attachMany: vi.fn(),
  toggleCollection: vi.fn(),
};

vi.mock("../chat/kbActions", () => ({
  useKbActions: () => actions,
}));

const source = (overrides: Partial<KbSource> = {}): KbSource => ({
  id: "source-a",
  kind: "file",
  title: "Methods.tex",
  origin: "/project/Methods.tex",
  chars: 1200,
  addedAt: "2026-09-10T12:00:00Z",
  updatedAt: "2026-09-10T12:00:00Z",
  ...overrides,
});

function publishSources(sources: KbSource[]): void {
  window.dispatchEvent(new CustomEvent("kb-sources", { detail: sources }));
}

function binding(overrides: Partial<KbBinding> = {}): KbBinding {
  return {
    attached: [],
    fullContent: [],
    onChange: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  resetKbSourcesForTests();
  for (const value of Object.values(actions)) {
    if (typeof value === "function" && "mockClear" in value) value.mockClear();
  }
});
afterEach(cleanup);

describe("AssistantUiKnowledgePicker", () => {
  it("filters official source rows by title, origin, and kind", () => {
    const sources = [source(), source({ id: "web", kind: "web", title: "Peyto paper", origin: "https://example.test" })];
    expect(filterKnowledgeSources(sources, "methods").map((item) => item.id)).toEqual(["source-a"]);
    expect(filterKnowledgeSources(sources, "example.test").map((item) => item.id)).toEqual(["web"]);
    expect(filterKnowledgeSources(sources, "WEB").map((item) => item.id)).toEqual(["web"]);
  });

  it("opens from the native KB event and toggles a source through shared actions", async () => {
    publishSources([source(), source({ id: "source-b", title: "Results.pdf", kind: "pdf" })]);
    renderUi(<AssistantUiKnowledgePicker binding={binding({ attached: ["source-a"] })} />);

    act(() => openKbPicker());
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search knowledge" })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Results\.pdf/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Results\.pdf/ }));
    expect(actions.toggle).toHaveBeenCalledWith("source-b");
  });

  it("keeps full-content and detach controls on the attached-source rows", () => {
    publishSources([source()]);
    renderUi(<AssistantUiKnowledgePicker binding={binding({ attached: ["source-a"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Knowledge sources" }));

    fireEvent.click(screen.getByRole("button", { name: "Use full content for Methods.tex" }));
    expect(actions.toggleFull).toHaveBeenCalledWith("source-a");
    fireEvent.click(screen.getByRole("button", { name: "Detach Methods.tex" }));
    expect(actions.toggle).toHaveBeenCalledWith("source-a");
  });

  it("delegates collection management to the existing native surface", () => {
    publishSources([source()]);
    const onOpenKnowledgeSurface = vi.fn();
    renderUi(
      <AssistantUiKnowledgePicker
        binding={binding()}
        onOpenKnowledgeSurface={onOpenKnowledgeSurface}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Knowledge sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage knowledge sources" }));
    expect(onOpenKnowledgeSurface).toHaveBeenCalledOnce();
  });
});
