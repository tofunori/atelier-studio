import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("../../lib/wsBus", () => ({ wsSend: vi.fn(() => true) }));

import { resetKbSourcesForTests, type KbSource } from "../../lib/kbSources";
import { KbPickerPanel } from "./KbPicker";

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
    // plan 051 : les groupes de type sont repliés par défaut (compte visible)
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    fireEvent.click(screen.getByText("PDF"));
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

  it("section gbrain : résultats épinglables, page déjà épinglée = rangée complète", () => {
    const onPin = vi.fn();
    const pinnedGbrain: KbSource = {
      id: "dddd4444", kind: "gbrain", title: "Fire and Ice", origin: "papers/aubry-wake-2022",
      chars: 3177, addedAt: "2026-07-17T10:03:00Z", updatedAt: "2026-07-17T10:03:00Z",
      meta: { slug: "papers/aubry-wake-2022", syncedAt: new Date().toISOString() },
    };
    renderUi(
      <KbPickerPanel
        {...panelProps({
          layout: "surface",
          sources: [...SOURCES, pinnedGbrain],
          gbrain: {
            query: "albédo", results: [
              { slug: "papers/aubry-wake-2022", snippet: "Fire and Ice" },
              { slug: "notes/albedo-feedback", snippet: "Boucle" },
            ],
            error: null, searching: false, searched: true,
            onQueryChange: vi.fn(), onSearch: vi.fn(), onPin,
          },
        })}
      />,
    );
    // page non épinglée : clic = épingler
    fireEvent.click(screen.getByRole("button", { name: /notes\/albedo-feedback/ }));
    expect(onPin).toHaveBeenCalledWith("notes/albedo-feedback");
    // page déjà épinglée : rendue comme une vraie rangée (titre + sync)
    expect(screen.getAllByText("Fire and Ice").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sync /).length).toBeGreaterThan(0);
  });

  it("page directe + destination : bouton par rangée et bascule → gbrain", () => {
    const onPromotePage = vi.fn();
    const onDestChange = vi.fn();
    renderUi(
      <KbPickerPanel
        {...panelProps({
          layout: "surface",
          onPromotePage,
          destination: { value: "local", onChange: onDestChange },
        })}
      />,
    );
    // groupes repliés par défaut : ouvrir PDF pour exposer les actions de rangée
    fireEvent.click(screen.getByText("PDF"));
    fireEvent.click(screen.getAllByLabelText("Créer une page gbrain (directe)")[0]);
    expect(onPromotePage).toHaveBeenCalledWith(SOURCES[0].id);
    fireEvent.click(screen.getByText("→ gbrain"));
    expect(onDestChange).toHaveBeenCalledWith("gbrain");
  });

  it("plan 051 : chips-collections filtrent (et ouvrent les groupes), archive par rangée", () => {
    const onArchive = vi.fn();
    const onTag = vi.fn();
    const tagged = SOURCES.map((source) =>
      source.id === "bbbb2222" ? { ...source, collections: ["agu26"] } : source);
    renderUi(
      <KbPickerPanel
        {...panelProps({
          layout: "surface",
          sources: tagged,
          collections: [{ slug: "agu26", title: "AGU26" }],
          archived: { count: 1, sources: [{ ...SOURCES[2], archived: true }] },
          onCreateCollection: vi.fn(),
          onTag,
          onArchive,
        })}
      />,
    );
    // chip avec compte ; le filtre ouvre les groupes → la source taguée est visible
    fireEvent.click(screen.getByText("AGU26 · 1"));
    expect(screen.getByText("Albedo feedbacks review")).toBeTruthy();
    expect(screen.queryByText("Cuffey & Paterson ch. 5")).toBeNull();
    // archive au survol de la rangée
    fireEvent.click(screen.getAllByLabelText("Archiver")[0]);
    expect(onArchive).toHaveBeenCalledWith("bbbb2222", false);
    // vue archivées : chip dédiée, désarchiver disponible
    fireEvent.click(screen.getByText("archivées · 1"));
    expect(screen.getByText("Décisions chap. 2")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Désarchiver")[0]);
    expect(onArchive).toHaveBeenCalledWith("cccc3333", true);
  });

  it("section gbrain : échec NAS affiché en place", () => {
    renderUi(
      <KbPickerPanel
        {...panelProps({
          layout: "surface",
          gbrain: {
            query: "x", results: [], error: "gbrain : délai dépassé (NAS injoignable ?)",
            searching: false, searched: true,
            onQueryChange: vi.fn(), onSearch: vi.fn(), onPin: vi.fn(),
          },
        })}
      />,
    );
    expect(screen.getByText(/NAS injoignable/)).toBeTruthy();
  });
});


describe("KbPickerPanel — sélection multiple (plan 052)", () => {
  it("mode sélection : groupe entier, lot vers collection, archivage groupé", () => {
    const onBatchTag = vi.fn();
    const onBatchArchive = vi.fn();
    renderUi(
      <KbPickerPanel
        {...panelProps({
          layout: "surface",
          collections: [{ slug: "agu26", title: "AGU26" }],
          onCreateCollection: vi.fn(),
          onTag: vi.fn(),
          onArchive: vi.fn(),
          onBatchTag,
          onBatchArchive,
          onBatchAttach: vi.fn(),
        })}
      />,
    );
    fireEvent.click(screen.getByText("Sélectionner"));
    // en mode sélection, cliquer l'en-tête d'un groupe sélectionne tout le groupe
    fireEvent.click(screen.getByText("PDF"));
    expect(screen.getByText("1 sélectionnée(s)")).toBeTruthy();
    fireEvent.click(screen.getByText("Ajouter à…"));
    fireEvent.click(screen.getByText("AGU26"));
    expect(onBatchTag).toHaveBeenCalledWith(["aaaa1111"], "agu26");
    // la barre se ferme après l'action
    expect(screen.queryByText("Ajouter à…")).toBeNull();
    // deuxième passe : archiver le groupe web en lot
    fireEvent.click(screen.getByText("Sélectionner"));
    fireEvent.click(screen.getByText("Web"));
    fireEvent.click(screen.getByText("Archiver"));
    expect(onBatchArchive).toHaveBeenCalledWith(["bbbb2222"]);
  });
});
