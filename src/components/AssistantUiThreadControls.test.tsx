import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderUi, resetTestState } from "../test/render";
import { setLanguage, t } from "../lib/i18n";
import {
  AssistantUiThreadControls,
  type AssistantUiLinkedAgent,
} from "./AssistantUiThreadControls";

afterEach(() => {
  cleanup();
  resetTestState();
});

beforeAll(() => setLanguage("fr"));

const linkedAgents: AssistantUiLinkedAgent[] = [
  { id: "parent-1", provider: "Claude", title: "Cadre", paused: false, direction: "parent" },
  { id: "child-1", provider: "Codex", title: "Vérification", paused: true, direction: "child" },
];

describe("AssistantUiThreadControls", () => {
  it("renders the host title and delegates native navigation actions", () => {
    const onNewChat = vi.fn();
    const onOpenProject = vi.fn();
    const onToggleExpand = vi.fn();
    renderUi(
      <AssistantUiThreadControls
        threadTitle="Résultats albédo"
        onNewChat={onNewChat}
        onOpenProject={onOpenProject}
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByRole("heading", { name: "Résultats albédo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("action.new-chat") }));
    fireEvent.click(screen.getByRole("button", { name: t("action.open-project") }));
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau du chat" }));
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(onOpenProject).toHaveBeenCalledOnce();
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("delegates expand label from the host state without owning layout state", () => {
    const onToggleExpand = vi.fn();
    renderUi(<AssistantUiThreadControls expanded onToggleExpand={onToggleExpand} />);
    const button = screen.getByRole("button", { name: "Réduire le panneau du chat" });
    fireEvent.click(button);
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("opens linked agents and delegates open/unlink callbacks", async () => {
    const onOpenLinkedAgent = vi.fn();
    const onUnlinkLinkedAgent = vi.fn();
    renderUi(
      <AssistantUiThreadControls
        linkedAgents={linkedAgents}
        onOpenLinkedAgent={onOpenLinkedAgent}
        onUnlinkLinkedAgent={onUnlinkLinkedAgent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: t("linkedConversation.title") }));
    await waitFor(() => expect(screen.getByRole("region", { name: t("linkedConversation.createdFrom") })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Claude · Cadre/u }));
    fireEvent.click(screen.getByRole("button", { name: t("linkedConversation.unlinkNamed", { provider: "Codex" }) }));
    expect(onOpenLinkedAgent).toHaveBeenCalledWith("parent-1");
    expect(onUnlinkLinkedAgent).toHaveBeenCalledWith("child-1");
    expect(screen.getByText("Codex · Vérification")).toHaveAttribute("data-paused", "true");
  });

  it("does not invent controls when the host provides no callbacks or linked records", () => {
    renderUi(<AssistantUiThreadControls threadTitle="Lecture seule" />);
    expect(screen.getByRole("heading", { name: "Lecture seule" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
