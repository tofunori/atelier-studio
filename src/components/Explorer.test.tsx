// Explorer (plan 021) — contrat clavier de l'arbre de fichiers : patron ARIA
// `tree`, roving tabindex (une seule tabulation depuis la recherche), flèches
// de navigation. Les tests décrivent le CONTRAT (rôles, focus, callbacks), pas
// le markup interne.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Explorer from "./Explorer";
import { setLanguage, t } from "../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

// dossiers d'abord, puis alphabétique (sortNodes) :
// src → [lib → i18n.ts, App.tsx] ; puis README.md
const FILES = ["src/App.tsx", "src/lib/i18n.ts", "README.md"];

function mount(onOpen = vi.fn()) {
  render(<Explorer files={FILES} onOpen={onOpen} />);
  return onOpen;
}

const item = (name: string) => screen.getByRole("treeitem", { name });
const tabbables = () => screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0);
// entrer dans l'arbre comme le fait l'utilisateur (Tab ou clic) : le focus
// réel déplace aussi l'index roving, via onFocus.
const enter = (name: string) => {
  const el = item(name);
  act(() => el.focus());
  return el;
};

describe("Explorer", () => {
  it("expose un arbre nommé et des treeitems hiérarchisés", () => {
    mount();
    const tree = screen.getByRole("tree", { name: t("atelier.file-explorer") });
    expect(tree).toBeInTheDocument();
    expect(item("src")).toHaveAttribute("aria-expanded", "false");
    expect(item("src")).toHaveAttribute("aria-level", "1");
    expect(item("README.md")).not.toHaveAttribute("aria-expanded");

    fireEvent.click(item("src"));
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(item("App.tsx")).toHaveAttribute("aria-level", "2");
  });

  it("n'expose qu'un seul nœud tabbable (roving tabindex)", () => {
    mount();
    expect(tabbables()).toEqual([item("src")]);
    expect(item("src")).toHaveAttribute("aria-selected", "true");

    enter("src");
    fireEvent.keyDown(item("src"), { key: "ArrowDown" });
    expect(tabbables()).toEqual([item("README.md")]);
    expect(item("src")).toHaveAttribute("aria-selected", "false");
  });

  it("navigue entre nœuds visibles avec ↓ et ↑, Home et End", () => {
    mount();
    enter("src");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("README.md"));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("src"));

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(item("README.md"));

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(item("src"));
  });

  it("→ déplie le dossier puis descend au premier enfant", () => {
    mount();
    enter("src");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(item("src")).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(item("src"));
    expect(item("lib")).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(item("lib"));
  });

  it("← remonte au parent puis replie le dossier", () => {
    mount();
    enter("src");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(item("lib"));

    // « lib » est replié : ← remonte au parent
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(item("src"));

    // « src » est déplié : ← le replie
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(item("src")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: "lib" })).toBeNull();
  });

  it("Entrée ouvre un fichier, Espace bascule un dossier", () => {
    const onOpen = mount();
    enter("README.md");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("README.md");

    enter("src");
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(item("src")).toHaveAttribute("aria-expanded", "true");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("amène au nœud suivant à la saisie d'une lettre", () => {
    mount();
    enter("src");
    fireEvent.keyDown(document.activeElement!, { key: "r" });
    expect(document.activeElement).toBe(item("README.md"));
  });

  it("conserve l'interaction souris (clic dossier, clic fichier)", () => {
    const onOpen = mount();
    fireEvent.click(item("src"));
    expect(item("src")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(item("App.tsx"));
    expect(onOpen).toHaveBeenCalledWith("src/App.tsx");
  });

  it("garde le contrat clavier sur la liste plate de la recherche", () => {
    const onOpen = mount();
    fireEvent.change(screen.getByRole("textbox", { name: t("home.search-file") }), {
      target: { value: "i18n" },
    });
    const match = item("src/lib/i18n.ts");
    expect(match).toHaveAttribute("aria-level", "1");
    expect(tabbables()).toEqual([match]);

    enter("src/lib/i18n.ts");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("src/lib/i18n.ts");
  });
});
