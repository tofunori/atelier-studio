// Vue d'un sous-agent à la place du chat (2026-10-19, maquette validée par
// Thierry) : mission, transcript chronologique, retour au chat par la flèche,
// le fil d'Ariane ou Échap.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage, t } from "../../lib/i18n";
import { SubagentView } from "./SubagentView";
import type { AgentDisplay } from "./AgentActivity";
import type { AgentEvent } from "../../lib/ws";

const agent: AgentDisplay = {
  threadId: "agent-1",
  displayName: "Explore",
  description: "Lister les figures du chapitre 2",
  status: "working",
  prompt: "Trouve toutes les figures citées dans le chapitre 2.",
  statusMessage: null,
  model: null,
  reasoningEffort: null,
  agentPath: null,
  startTs: 1000,
};

function view(over: Partial<Parameters<typeof SubagentView>[0]> = {}) {
  const onClose = vi.fn();
  renderUi(<SubagentView agent={agent} events={[]} threadTitle="Fil albédo" onClose={onClose}
    renderToolLine={(action) => <span className="tool-line-probe">{action.kind === "tool" || action.kind === "tool_update" ? action.name : ""}</span>}
    {...over} />);
  return onClose;
}

beforeEach(() => { resetTestState(); setLanguage("fr"); });
afterEach(cleanup);

describe("SubagentView", () => {
  it("montre la mission et le fil d'Ariane du fil au sous-agent", () => {
    view();
    expect(screen.getByText(agent.prompt!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fil albédo" })).toBeInTheDocument();
    expect(screen.getByText(agent.description!)).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("subagent-view")).toHaveAttribute("data-agent-status", "working");
  });

  it("rend outils et texte dans l'ordre du transcript", () => {
    const events: AgentEvent[] = [
      { kind: "tool_update", id: "t1", name: "Read", output: "", status: "completed", detail: "chap2.tex" } as AgentEvent,
      { kind: "text", text: "Trois figures trouvées." },
      { kind: "tool_update", id: "t2", name: "Grep", output: "", status: "running", detail: "figure" } as AgentEvent,
    ];
    view({ events });
    const body = screen.getByTestId("agent-transcript");
    const text = body.textContent ?? "";
    expect(text.indexOf("Read")).toBeGreaterThan(-1);
    expect(text.indexOf("Read")).toBeLessThan(text.indexOf("Trois figures trouvées."));
    expect(text.indexOf("Trois figures trouvées.")).toBeLessThan(text.indexOf("Grep"));
  });

  it("revient au chat par la flèche, le fil d'Ariane et Échap", () => {
    const onClose = view();
    fireEvent.click(screen.getByRole("button", { name: t("chat.subagent-back") }));
    fireEvent.click(screen.getByRole("button", { name: "Fil albédo" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("laisse Échap à un menu ou une boîte qui l'a déjà pris", () => {
    const onClose = view();
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sans transcript, un sous-agent fini montre son rapport d'état ou le dit", () => {
    view({ agent: { ...agent, status: "done", statusMessage: "Rapport : 3 figures." } });
    expect(screen.getByText("Rapport : 3 figures.")).toBeInTheDocument();
    cleanup();
    view({ agent: { ...agent, status: "done", statusMessage: null } });
    expect(screen.getByTestId("agent-transcript-empty")).toBeInTheDocument();
  });
});
