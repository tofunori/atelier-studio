// Tests SegmentedControl + ContextChip (matrice plan 016) : sémantique
// radiogroup avec roving tabindex, flèches = déplacement + sélection,
// noms accessibles, animation d'entrée du chip et retrait nommé.
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SegmentedControl, ContextChip, type SegmentedOption } from "./index";

afterEach(cleanup);

const LAYOUTS: SegmentedOption[] = [
  { value: "chat", label: "C", ariaLabel: "Chat" },
  { value: "split", label: "S", ariaLabel: "Partagé" },
  { value: "atelier", label: "A", ariaLabel: "Atelier" },
];

function SegFixture(props: { onChange?: (v: string) => void; options?: SegmentedOption[] }) {
  const [value, setValue] = useState("chat");
  return (
    <SegmentedControl
      options={props.options ?? LAYOUTS}
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
      label="Disposition"
    />
  );
}

describe("SegmentedControl", () => {
  it("expose un radiogroup nommé dont chaque option a un nom accessible", () => {
    render(<SegFixture />);
    const group = screen.getByRole("radiogroup", { name: "Disposition" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Chat" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Partagé" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Atelier" })).toBeInTheDocument();
  });

  it("un seul arrêt de tabulation : l'option cochée porte tabIndex 0, les autres -1", () => {
    render(<SegFixture />);
    expect(screen.getByRole("radio", { name: "Chat" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Partagé" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Atelier" })).toHaveAttribute("tabindex", "-1");
  });

  it("clic : sélectionne et pose la classe .on (parité visuelle tb-seg)", () => {
    const onChange = vi.fn();
    render(<SegFixture onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Atelier" }));
    expect(onChange).toHaveBeenCalledWith("atelier");
    expect(screen.getByRole("radio", { name: "Atelier" }).className.split(/\s+/)).toContain("on");
    expect(screen.getByRole("radio", { name: "Chat" }).className.split(/\s+/)).not.toContain("on");
  });

  it("flèches : droite/bas avance (cycle), gauche/haut recule ; le focus suit la sélection", () => {
    const onChange = vi.fn();
    render(<SegFixture onChange={onChange} />);
    const group = screen.getByRole("radiogroup");
    const chat = screen.getByRole("radio", { name: "Chat" });
    chat.focus();

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("split");
    expect(screen.getByRole("radio", { name: "Partagé" })).toHaveFocus();

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("chat");
    expect(screen.getByRole("radio", { name: "Chat" })).toHaveFocus();

    fireEvent.keyDown(group, { key: "ArrowLeft" }); // cycle arrière
    expect(onChange).toHaveBeenLastCalledWith("atelier");
    expect(screen.getByRole("radio", { name: "Atelier" })).toHaveFocus();
  });

  it("les options désactivées sont sautées par les flèches et inertes au clic", () => {
    const onChange = vi.fn();
    render(
      <SegFixture
        onChange={onChange}
        options={[LAYOUTS[0], { ...LAYOUTS[1], disabled: true }, LAYOUTS[2]]}
      />,
    );
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("atelier"); // Partagé sauté
    fireEvent.click(screen.getByRole("radio", { name: "Partagé" }));
    expect(onChange).toHaveBeenCalledTimes(1); // clic inerte
  });
});

describe("ContextChip", () => {
  it("rend le libellé et la nature, puis entre en scène (classe .entered au frame suivant)", async () => {
    const { container } = render(<ContextChip label="fig_albedo.pdf" kind="sel." />);
    const chip = container.querySelector(".ui-ctxchip")!;
    expect(chip).toHaveTextContent("fig_albedo.pdf");
    expect(chip).toHaveTextContent("sel.");
    await waitFor(() => expect(chip.className).toContain("entered"));
  });

  it("le retrait est un bouton nommé (removeLabel imposé par le type avec onRemove)", () => {
    const onRemove = vi.fn();
    render(<ContextChip label="notes.md" onRemove={onRemove} removeLabel="Retirer notes.md" />);
    const btn = screen.getByRole("button", { name: "Retirer notes.md" });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("onOpen rend le libellé cliquable ; sans onOpen le libellé est inerte", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<ContextChip label="extrait.txt" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "extrait.txt" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    rerender(<ContextChip label="extrait.txt" />);
    expect(screen.queryByRole("button", { name: "extrait.txt" })).toBeNull();
  });

  it("le libellé porte la classe de troncature (ellipse CSS, géométrie bornée)", () => {
    const long = "figure_avec_un_nom_vraiment_tres_long_2026-07-09_final_v3.pdf";
    const { container } = render(<ContextChip label={long} />);
    const label = container.querySelector(".ui-ctxchip .label")!;
    expect(label).toHaveTextContent(long);
  });
});
