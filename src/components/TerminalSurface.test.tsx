import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../lib/i18n";
import TerminalSurface from "./TerminalSurface";

const wsSendMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("../lib/wsBus", () => ({ wsSend: wsSendMock }));

vi.mock("./Terminal", () => ({
  default: ({ termId, visible, onReady }: { termId: string; visible: boolean; onReady?: (termId: string) => void }) => (
    <div data-testid={`terminal-${termId}`} data-visible={visible}>
      <button type="button" onClick={() => onReady?.(termId)}>ready</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it("runs a Narval bootstrap command once the PTY reports ready", async () => {
    wsSendMock.mockClear();
    const handled = vi.fn();
    render(
      <TerminalSurface
        ws={null}
        cwd="/tmp"
        visible
        bootstrapCommand="ssh nas -t ssh narval-vpn"
        onBootstrapHandled={handled}
      />,
    );
    fireEvent.click(await screen.findByText("ready"));
    await waitFor(() => {
      expect(wsSendMock).toHaveBeenCalledWith(expect.objectContaining({
        type: "termInput",
        data: "ssh nas -t ssh narval-vpn\r",
      }));
      expect(handled).toHaveBeenCalledTimes(1);
    });
  });
});
