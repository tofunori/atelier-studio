import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, act } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("../../lib/wsBus", () => ({ wsSend: vi.fn(() => true) }));

import { wsSend } from "../../lib/wsBus";
import { onOpenKbPicker, resetKbSourcesForTests, type KbSource } from "../../lib/kbSources";
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

describe("KbPickerPanel — layout surface (plan 050)", () => {
  it("montre les attachées d'abord, la bibliothèque sans doublon", () => {
    renderUi(
      <KbPickerPanel
        {...panelProps({ attached: ["bbbb2222"], layout: "surface", threadTitle: "Abstract AGU" })}
      />,
    );
    expect(screen.getByText("Attachées à « Abstract AGU » — 1")).toBeTruthy();
    expect(screen.getByText("Bibliothèque")).toBeTruthy();
    // la source attachée apparaît une seule fois (étage attachées, pas bibliothèque)
    expect(screen.getAllByText("Albedo feedbacks review")).toHaveLength(1);
    // les non-attachées restent dans leurs groupes de type
    expect(screen.getByText("Cuffey & Paterson ch. 5")).toBeTruthy();
  });

  it("sans attache : message d'invite, pas de doublon gbrain", () => {
    renderUi(
      <KbPickerPanel {...panelProps({ layout: "surface", threadTitle: "" })} />,
    );
    expect(screen.getByText(/Rien d'attaché à cette conversation/)).toBeTruthy();
    expect(screen.getAllByText("Corpus thèse (gbrain)")).toHaveLength(1);
  });

  it("le layout popover reste inchangé (pas d'étage attachées)", () => {
    renderUi(<KbPickerPanel {...panelProps({ attached: ["bbbb2222"] })} />);
    expect(screen.queryByText(/Attachées à/)).toBeNull();
    expect(screen.getByText("Albedo feedbacks review")).toBeTruthy();
  });
});

describe("KbChips", () => {
  it("une seule source = déjà la pilule agrégée, titre en aperçu", () => {
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-sources", { detail: SOURCES }));
    });
    const opened = vi.fn();
    const unsubscribe = onOpenKbPicker(opened);
    renderUi(<KbChips attached={["aaaa1111"]} fullContent={["aaaa1111"]} onDetach={vi.fn()} />);
    expect(screen.getByText("1 source attachée")).toBeTruthy();
    expect(screen.getByText(/Cuffey & Paterson ch\. 5/)).toBeTruthy();
    fireEvent.click(screen.getByText("1 source attachée"));
    expect(opened).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("gbrain garde sa pilule propre, détachable directement", () => {
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-sources", { detail: SOURCES }));
    });
    const onDetach = vi.fn();
    renderUi(<KbChips attached={["gbrain"]} fullContent={[]} onDetach={onDetach} />);
    expect(screen.getByText("Corpus thèse (gbrain)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Détacher de la conversation"));
    expect(onDetach).toHaveBeenCalledWith("gbrain");
  });

  it("demande la liste si des ids attachés n'ont pas encore de titres", () => {
    renderUi(<KbChips attached={["zzzz9999"]} fullContent={[]} onDetach={vi.fn()} />);
    expect(wsSend).toHaveBeenCalledWith({ type: "kbList" });
    expect(screen.getByText(/zzzz9999/)).toBeTruthy();
  });

  it("agrège dès 3 sources : une seule pilule, aperçu des titres, ouvre le picker", () => {
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-sources", { detail: SOURCES }));
    });
    const opened = vi.fn();
    const unsubscribe = onOpenKbPicker(opened);
    renderUi(
      <KbChips
        attached={["aaaa1111", "bbbb2222", "cccc3333", "gbrain"]}
        fullContent={[]}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByText("3 sources attachées")).toBeTruthy();
    expect(screen.getByText(/Cuffey & Paterson ch\. 5, Albedo feedbacks review/)).toBeTruthy();
    // les sources ordinaires ne sont plus des pilules individuelles…
    expect(screen.queryByText("Décisions chap. 2")).toBeNull();
    // …mais gbrain garde la sienne, détachable
    expect(screen.getByText("Corpus thèse (gbrain)")).toBeTruthy();
    fireEvent.click(screen.getByText("3 sources attachées"));
    expect(opened).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("agrège aussi à 2 : même comportement quel que soit le nombre", () => {
    act(() => {
      window.dispatchEvent(new CustomEvent("kb-sources", { detail: SOURCES }));
    });
    renderUi(<KbChips attached={["aaaa1111", "bbbb2222"]} fullContent={[]} onDetach={vi.fn()} />);
    expect(screen.getByText("2 sources attachées")).toBeTruthy();
    // aperçu complet sans ellipse (tout est déjà listé)
    expect(screen.getByText("Cuffey & Paterson ch. 5, Albedo feedbacks review")).toBeTruthy();
    expect(screen.queryByText(/…/)).toBeNull();
  });
});
