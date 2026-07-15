import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderUi } from "../../test/render";
import { ActivityDisclosure, ScrollToBottomButton, Tab, TabList } from ".";

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

  it("ScrollToBottom reste inerte au bord bas et devient actionnable à distance", () => {
    const scroll = vi.fn();
    const { rerender } = renderUi(<ScrollToBottomButton label="Bas" show={false} onClick={scroll} />);
    expect(screen.getByTitle("Bas")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByTitle("Bas"));
    expect(scroll).not.toHaveBeenCalled();

    rerender(<ScrollToBottomButton label="Bas" show working onClick={scroll} />);
    expect(screen.getByTitle("Bas")).toHaveAttribute("data-active", "true");
    expect(document.querySelectorAll(".ui-scroll-working-dots > span")).toHaveLength(3);
    fireEvent.click(screen.getByTitle("Bas"));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
