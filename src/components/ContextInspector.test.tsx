// ContextInspector (plan 018, étape 4) — RTL : sections rendues, Escape
// (une seule fois + cleanup au démontage), contrat addState (pending bloque
// le double ajout, added annoncé en role=status), mise à jour au changement
// d'item, ouverture dans l'Atelier avec le bon rel.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ContextInspector, type InspectedFile } from "./ContextInspector";
import { setLanguage } from "../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

function file(partial: Partial<InspectedFile> = {}): InspectedFile {
  return {
    rel: "figures/albedo_trend.png",
    name: "albedo_trend.png",
    dir: "figures",
    kind: "figure",
    projectRoot: "/Users/tofunori/thesis",
    projectName: "Thèse albédo",
    ...partial,
  };
}

function props(overrides: Partial<Parameters<typeof ContextInspector>[0]> = {}) {
  return {
    item: file(),
    onClose: vi.fn(),
    onOpen: vi.fn(),
    onAddToChat: vi.fn(),
    addState: "idle" as const,
    ...overrides,
  };
}

describe("ContextInspector", () => {
  it("sections rendues : nom, type, chemin (title complet), projet", () => {
    render(<ContextInspector {...props()} />);
    // nom présent (titre du panneau + rangée Aperçu)
    expect(screen.getAllByText("albedo_trend.png").length).toBeGreaterThan(0);
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("figure")).toBeInTheDocument();
    // chemin tronqué par CSS mais title = rel complet
    const path = screen.getByTitle("figures/albedo_trend.png");
    expect(path).toHaveTextContent("figures/albedo_trend.png");
    expect(screen.getByText("Thèse albédo")).toBeInTheDocument();
  });

  it("projet sans nom : projectRoot affiché en repli", () => {
    render(<ContextInspector {...props({ item: file({ projectName: null }) })} />);
    expect(screen.getByText("/Users/tofunori/thesis")).toBeInTheDocument();
  });

  it("Escape appelle onClose une seule fois ; listener retiré au démontage", () => {
    const onClose = vi.fn();
    const { unmount } = render(<ContextInspector {...props({ onClose })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("idle : le bouton primaire appelle onAddToChat avec l'item", () => {
    const onAddToChat = vi.fn();
    const p = props({ onAddToChat });
    render(<ContextInspector {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au chat" }));
    expect(onAddToChat).toHaveBeenCalledTimes(1);
    expect(onAddToChat).toHaveBeenCalledWith(p.item);
  });

  it("pending : bouton disabled + aria-busy (double ajout bloqué)", () => {
    const onAddToChat = vi.fn();
    render(<ContextInspector {...props({ addState: "pending", onAddToChat })} />);
    const btn = screen.getByRole("button", { name: "Ajouter au chat" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onAddToChat).not.toHaveBeenCalled();
  });

  it("added : libellé « Ajouté au contexte » + accusé role=status ; bouton FOCUSABLE (pas d'éjection du focus — le double ajout est bloqué par l'hôte)", () => {
    render(<ContextInspector {...props({ addState: "added" })} />);
    const btn = screen.getByRole("button", { name: "Ajouté au contexte" });
    expect(btn).not.toBeDisabled();
    btn.focus();
    expect(btn).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Ajouté au contexte");
  });

  it("changement d'item : contenu mis à jour (ancien nom/chemin absents)", () => {
    const p = props();
    const { rerender } = render(<ContextInspector {...p} />);
    rerender(
      <ContextInspector
        {...p}
        item={file({ rel: "scripts/trend.py", name: "trend.py", dir: "scripts", kind: "code" })}
      />,
    );
    expect(screen.getAllByText("trend.py").length).toBeGreaterThan(0);
    expect(screen.getByTitle("scripts/trend.py")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.queryByText("albedo_trend.png")).toBeNull();
    expect(screen.queryByTitle("figures/albedo_trend.png")).toBeNull();
  });

  it("« Ouvrir dans l'Atelier » appelle onOpen avec rel", () => {
    const onOpen = vi.fn();
    render(<ContextInspector {...props({ onOpen })} />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans l'Atelier" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("figures/albedo_trend.png");
  });
});
