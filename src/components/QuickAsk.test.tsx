import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const { wsSendMock } = vi.hoisted(() => ({ wsSendMock: vi.fn(() => true) }));
vi.mock("../lib/wsBus", () => ({ wsSend: wsSendMock }));

import QuickAsk from "./QuickAsk";
import { renderUi, resetTestState } from "../test/render";
import { makeProviderInfo } from "../test/fixtures";

const providers = [
  makeProviderInfo({ id: "claude", label: "Claude", models: ["claude-fable-5", "claude-sonnet-5"], defaultModel: "claude-fable-5" }),
  makeProviderInfo({ id: "codex", label: "Codex", models: ["gpt-5.6-luna", "gpt-5.5"], defaultModel: "gpt-5.5", efforts: ["low", "medium", "high", "xhigh", "max"] }),
  makeProviderInfo({ id: "grok", label: "Grok", models: ["grok-4.5", "grok-composer-2.5-fast"], defaultModel: "grok-4.5", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"] }),
];

function renderQuickAsk() {
  return renderUi(
    <QuickAsk
      open
      minimized={false}
      draft=""
      providers={providers}
      defaultModels={{ grok: "grok-4.5" }}
      defaultEfforts={{ grok: "high" }}
      onMinimize={vi.fn()}
      onClose={vi.fn()}
      onInject={vi.fn()}
      onPromote={vi.fn()}
    />,
  );
}

beforeEach(() => {
  resetTestState();
  wsSendMock.mockClear();
});
afterEach(cleanup);

describe("Quick Ask", () => {
  it("utilise Grok 4.5 high par défaut lors de l'envoi", async () => {
    renderQuickAsk();
    expect(screen.getByText("Grok 4.5")).toBeTruthy();
    expect(screen.getByText("· High")).toBeTruthy();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Question rapide" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(wsSendMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "quickAsk",
      prompt: "Question rapide",
      provider: "grok",
      model: "grok-4.5",
      effort: "high",
    })));
  });

  it("ouvre un sélecteur complet provider, modèle et effort", async () => {
    renderQuickAsk();
    fireEvent.click(screen.getByRole("button", { name: /^(Modèle Quick Ask|Quick Ask model)$/ }));

    expect(await screen.findByRole("combobox", { name: "Provider" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^(Modèle|Model)$/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Effort" })).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Provider" }));
    expect(await screen.findByRole("option", { name: "Claude" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Codex" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Grok" })).toBeTruthy();
  });
});
