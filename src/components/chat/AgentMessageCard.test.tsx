import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMessageCard } from "./AgentMessageCard";
import { setLanguage } from "../../lib/i18n";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

describe("AgentMessageCard", () => {
  it("un message retenu dit « en pause » avec le nom du spécialiste, plus « réfléchit »", () => {
    const onContinue = vi.fn();
    render(
      <AgentMessageCard direction="sent" peerProvider="codex" peerTitle="NatureFigures · Refais le panneau b"
        text="Panneau b en barres" status="paused" onContinue={onContinue} />,
    );
    expect(screen.getByText("NatureFigures · en pause")).toBeTruthy();
    expect(screen.queryByText(/réfléchit/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("un rapport reçu mais retenu garde son texte et propose Continuer", () => {
    render(
      <AgentMessageCard direction="received" peerProvider="codex" peerTitle="Stats · M3"
        text="R-hat < 1.01 partout" status="paused" onContinue={() => {}} />,
    );
    expect(screen.getByText("R-hat < 1.01 partout")).toBeTruthy();
    expect(screen.getByText("Stats · en pause")).toBeTruthy();
  });

  it("en cours de remise, la pastille « réfléchit » reste", () => {
    render(<AgentMessageCard direction="sent" peerProvider="codex" text="x" status="queued" />);
    expect(screen.getByText("Codex réfléchit…")).toBeTruthy();
  });
});
