import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, act } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("../../lib/wsBus", () => ({ wsSend: vi.fn(() => true) }));

import { wsSend } from "../../lib/wsBus";
import { resetKbSourcesForTests, type KbSource } from "../../lib/kbSources";
import { KbChips, KbPickerPanel } from "./KbPicker";

const SOURCES: KbSource[] = [
  { id: "aaaa1111", kind: "pdf", title: "Cuffey & Paterson ch. 5", origin: "/tmp/c.pdf",
    chars: 118432, addedAt: "2026-07-17T10:00:00Z", updatedAt: "2026-07-17T10:00:00Z" },
  { id: "bbbb2222", kind: "web", title: "Albedo feedbacks review", origin: "https://x.org/r",
    chars: 22000, addedAt: "2026-07-17T10:01:00Z", updatedAt: "2026-07-17T10:01:00Z" },
  { id: "cccc3333", kind: "note", title: "Décisions chap. 2", origin: null,
    chars: 900, addedAt: "2026-07-17T10:02:00Z", updatedAt: "2026-07-17T10:02:00Z" },
];

function panelProps(over: Partial<Parameters<typeof KbPickerPanel>[0]> = {}) {
  return {
    sources: SOURCES,
    attached: [] as string[],
    fullContent: [] as string[],
    error: null,
    onToggle: vi.fn(),
    onToggleFull: vi.fn(),
    onRemoveSource: vi.fn(),
    onPromote: vi.fn(),
    promoted: null,
    onAddFiles: vi.fn(),
    onAddFolder: vi.fn(),
    onAddUrl: vi.fn(),
    onAddNote: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  setLanguage("fr");
});

afterEach(() => {
  cleanup();
  resetTestState?.();
  resetKbSourcesForTests();
  vi.clearAllMocks();
});

describe("KbPickerPanel", () => {
  it("groupe les sources par type et affiche les métadonnées", () => {
    renderUi(<KbPickerPanel {...panelProps()} />);
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.getByText("Web")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(screen.getByText("118k")).toBeTruthy();
  });

  it("cliquer une rangée bascule l'attache ; la recherche filtre", () => {
    const props = panelProps();
    renderUi(<KbPickerPanel {...props} />);
    fireEvent.click(screen.getByText("Albedo feedbacks review"));
    expect(props.onToggle).toHaveBeenCalledWith("bbbb2222");
    // la source spéciale corpus est toujours proposée et bascule sur "gbrain"
    fireEvent.click(screen.getByText("Corpus thèse (gbrain)"));
    expect(props.onToggle).toHaveBeenCalledWith("gbrain");
    fireEvent.change(screen.getByPlaceholderText("Rechercher…"), { target: { value: "décisions" } });
    expect(screen.queryByText("Albedo feedbacks review")).toBeNull();
    expect(screen.getByText("Décisions chap. 2")).toBeTruthy();
  });

  it("épingler une URL et une note passe par les callbacks", () => {
    const props = panelProps();
    renderUi(<KbPickerPanel {...props} />);
    const url = screen.getByPlaceholderText("Épingler une URL (Entrée)");
    fireEvent.change(url, { target: { value: "https://exemple.org/a" } });
    fireEvent.keyDown(url, { key: "Enter" });
    expect(props.onAddUrl).toHaveBeenCalledWith("https://exemple.org/a");
    fireEvent.click(screen.getByText("Note"));
    fireEvent.change(screen.getByPlaceholderText("Titre de la note"), { target: { value: "T" } });
    fireEvent.change(screen.getByPlaceholderText("Contenu…"), { target: { value: "Contenu" } });
    fireEvent.click(screen.getByText("Épingler la note"));
    expect(props.onAddNote).toHaveBeenCalledWith("T", "Contenu");
  });
});

describe("KbChips", () => {
  it("rend les pilules des sources attachées et détache au clic", () => {
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-sources", { detail: SOURCES }));
    });
    const onDetach = vi.fn();
    renderUi(<KbChips attached={["aaaa1111"]} fullContent={["aaaa1111"]} onDetach={onDetach} />);
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Détacher de la conversation"));
    expect(onDetach).toHaveBeenCalledWith("aaaa1111");
  });

  it("demande la liste si des ids attachés n'ont pas encore de titres", () => {
    renderUi(<KbChips attached={["zzzz9999"]} fullContent={[]} onDetach={vi.fn()} />);
    expect(wsSend).toHaveBeenCalledWith({ type: "kbList" });
    expect(screen.getByText("zzzz9999")).toBeTruthy();
  });
});
