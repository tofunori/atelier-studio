import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderUi } from "../../test/render";
import { ActivityDisclosure, JumpNavigation, Tab, TabList } from ".";

describe("patterns officiels du design system", () => {
  it("Tabs expose sélection, variante compacte et fermeture", () => {
    const close = vi.fn();
    renderUi(<TabList><Tab compact active label="Gallery" /><Tab label="main.tex" onClose={close}>main.tex</Tab></TabList>);
    expect(screen.getByRole("tab", { name: "Gallery" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Gallery" })).toHaveClass("is-compact");
    fireEvent.click(screen.getByRole("button"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ActivityDisclosure garde chaque détail indépendamment repliable", () => {
    const toggle = vi.fn();
    renderUi(<ActivityDisclosure open={false} onToggle={toggle} label="Read" status="completed">sortie</ActivityDisclosure>);
    expect(screen.queryByText("sortie")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Read/ }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("JumpNavigation sépare les deux destinations", () => {
    const first = vi.fn(); const last = vi.fn();
    renderUi(<JumpNavigation firstLabel="Dernier message" firstIcon="↑" onFirst={first} lastLabel="Bas" lastIcon="↓" onLast={last} />);
    fireEvent.click(screen.getByTitle("Dernier message"));
    fireEvent.click(screen.getByTitle("Bas"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(last).toHaveBeenCalledTimes(1);
  });
});
