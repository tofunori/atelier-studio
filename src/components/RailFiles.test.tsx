// Fichiers ouverts dans le rail (plan 056) : monogrammes, glyphes de type,
// débordement, fermeture au clic milieu.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, cleanup, act } from "@testing-library/react";
import RailFiles, { MAX_TILES, kindOf, monogram } from "./RailFiles";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage } from "../lib/i18n";

const FILES = [
  { id: "t1", title: "methods_en.tex", url: "file:///p/manuscript_ch1/methods_en.tex" },
  { id: "t2", title: "intro_en.tex", url: "file:///p/manuscript_ch1/intro_en.tex" },
  { id: "t3", title: "albedo_trends.py", url: "file:///p/scripts/albedo_trends.py" },
  { id: "t4", title: "notes-terrain.md", url: "file:///p/journal/notes-terrain.md" },
];

function props(over: Partial<React.ComponentProps<typeof RailFiles>> = {}) {
  return {
    files: FILES,
    activeFile: "t1",
    onSelectFile: vi.fn(),
    onCloseFile: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("monogramme", () => {
  it("prend deux lettres du nom, sans extension ni séparateur", () => {
    expect(monogram("methods_en.tex")).toBe("me");
    expect(monogram("/p/scripts/albedo_trends.py")).toBe("al");
    expect(monogram("notes-terrain.md")).toBe("no");
    expect(monogram("2024_rapport.md")).toBe("20");
  });

  it("reste lisible sur les noms dégénérés", () => {
    expect(monogram("")).toBe("··");
    expect(monogram("_.tex")).toBe("··");
    expect(monogram("é.tex")).toBe("é");
  });

  it("est toujours en minuscules — les capitales sont aux projets", () => {
    expect(monogram("Methods_EN.tex")).toBe("me");
    expect(monogram("README.md")).toBe("re");
  });
});

describe("type de fichier", () => {
  it("range les extensions en quatre familles", () => {
    expect(kindOf({ id: "a", title: "x.tex" })).toBe("tex");
    expect(kindOf({ id: "a", title: "x.py" })).toBe("code");
    expect(kindOf({ id: "a", title: "x.md" })).toBe("note");
    expect(kindOf({ id: "a", title: "x.pdf" })).toBe("image");
    expect(kindOf({ id: "a", title: "Makefile" })).toBe("doc");
  });

  it("lit l'extension de l'URL quand le titre n'en a pas", () => {
    expect(kindOf({ id: "a", title: "Sans titre", url: "file:///p/a.py" })).toBe("code");
    expect(kindOf({ id: "a", title: "figure", url: "http://x/f.png?v=2" })).toBe("image");
  });
});

describe("RailFiles", () => {
  it("reste absent quand rien n'est ouvert", () => {
    const { container } = renderUi(<RailFiles {...props({ files: [] })} />);
    expect(container.querySelector(".rail-files")).toBeNull();
  });

  it("montre un monogramme par fichier et marque l'actif", () => {
    const { container } = renderUi(<RailFiles {...props()} />);
    expect(container.querySelectorAll(".rail-file").length).toBe(4);
    expect(screen.getByText("me")).toBeTruthy();
    expect(screen.getByText("al")).toBeTruthy();
    expect(container.querySelector(".rail-file.on")?.textContent).toContain("me");
  });

  it("sélectionne au clic, ferme au clic milieu", () => {
    const onSelectFile = vi.fn();
    const onCloseFile = vi.fn();
    renderUi(<RailFiles {...props({ onSelectFile, onCloseFile })} />);
    fireEvent.click(screen.getByText("in"));
    expect(onSelectFile).toHaveBeenCalledWith("t2");
    // auxClick n'est pas exposé par fireEvent : on émet l'événement natif
    fireEvent(screen.getByText("al"), new MouseEvent("auxclick", { button: 1, bubbles: true }));
    expect(onCloseFile).toHaveBeenCalledWith("t3");
  });

  it("ignore le clic droit — il ne ferme rien", () => {
    const onCloseFile = vi.fn();
    renderUi(<RailFiles {...props({ onCloseFile })} />);
    fireEvent(screen.getByText("al"), new MouseEvent("auxclick", { button: 2, bubbles: true }));
    expect(onCloseFile).not.toHaveBeenCalled();
  });

  it("plafonne à huit tuiles et range le reste derrière un compteur", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id: `t${i}`, title: `fichier_${i}.tex`,
    }));
    const onSelectFile = vi.fn();
    const { container } = renderUi(<RailFiles {...props({ files: many, onSelectFile })} />);
    expect(container.querySelectorAll(".rail-file").length).toBe(MAX_TILES);
    fireEvent.click(screen.getByText("+3"));
    await act(async () => { await vi.dynamicImportSettled(); });
    fireEvent.click(screen.getByText("fichier_10.tex"));
    expect(onSelectFile).toHaveBeenCalledWith("t10");
  });

  it("annonce le raccourci de position dans l'infobulle", () => {
    renderUi(<RailFiles {...props()} />);
    expect(screen.getByTitle("methods_en.tex — ⌥1")).toBeTruthy();
    expect(screen.getByTitle("intro_en.tex — ⌥2")).toBeTruthy();
  });
});
