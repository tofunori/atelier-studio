import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposedPlanCard } from "./ProposedPlanCard";
import type { AgentEvent } from "../../lib/ws";

const send = vi.fn((_message: unknown) => true);
vi.mock("../../lib/wsBus", () => ({ wsSend: (message: unknown) => send(message) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(async () => null) }));

describe("ProposedPlanCard", () => {
  afterEach(cleanup);
  beforeEach(() => {
    send.mockClear();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it("replie un plan long et conserve le markdown complet pour la copie", () => {
    const markdown = `# Refonte du chat\n${Array.from({ length: 24 }, (_, index) => `${index + 1}. Étape ${index + 1}`).join("\n")}`;
    const event = { kind: "proposed_plan", planId: "p1", markdown } as Extract<AgentEvent, { kind: "proposed_plan" }>;
    render(<ProposedPlanCard event={event} threadId="t1" />);
    expect(screen.getByRole("button", { name: /développer|expand/i })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /copier|copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(markdown);
  });

  it("enregistre le plan dans .plan avec son identité durable", () => {
    const event = { kind: "proposed_plan", planId: "p2", markdown: "# Audit précis\n\n- Lire" } as Extract<AgentEvent, { kind: "proposed_plan" }>;
    render(<ProposedPlanCard event={event} threadId="t2" />);
    fireEvent.click(screen.getByRole("button", { name: /\.plan/i }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "savePlan", threadId: "t2", planId: "p2", fileName: "audit-precis.md",
    }));
  });
});
