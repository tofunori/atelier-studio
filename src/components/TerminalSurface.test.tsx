import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "../lib/i18n";
import TerminalSurface from "./TerminalSurface";

vi.mock("./Terminal", () => ({
  default: ({ termId, visible }: { termId: string; visible: boolean }) => (
    <div data-testid={`terminal-${termId}`} data-visible={visible} />
  ),
}));

describe("TerminalSurface", () => {
  it("renders terminal sessions as real tabs and exposes the active session", async () => {
    render(<TerminalSurface ws={null} cwd="/tmp" visible />);

    const terminalOne = await screen.findByRole("tab", { name: `${t("atelier.terminal")} 1` });
    expect(terminalOne.closest(".term-tabs")).toBeInTheDocument();
    expect(terminalOne).toHaveClass("is-active");

    fireEvent.click(screen.getByTitle(t("action.new-terminal")));
    const terminalTwo = await screen.findByRole("tab", { name: `${t("atelier.terminal")} 2` });
    await waitFor(() => expect(terminalTwo).toHaveClass("is-active"));
    expect(terminalOne).not.toHaveClass("is-active");

    fireEvent.click(terminalOne);
    expect(terminalOne).toHaveClass("is-active");
    expect(terminalTwo).not.toHaveClass("is-active");
  });
});
