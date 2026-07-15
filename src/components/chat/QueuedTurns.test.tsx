import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderUi } from "../../test/render";
import type { QueuedTurn } from "../../lib/chatDraftStore";
import { t } from "../../lib/i18n";
import { QueuedTurns } from "./QueuedTurns";

function queuedTurn(id: string, prompt: string): QueuedTurn {
  return {
    id,
    prompt,
    provider: "codex",
    model: "gpt-5.6-sol",
    effort: "medium",
    permissionMode: "bypassPermissions",
    attachments: [],
    webSearch: false,
    additionalDirectories: [],
    pluginSkills: [],
    autoReview: null,
    createdAt: 1783684800000,
  };
}

afterEach(cleanup);

describe("QueuedTurns", () => {
  it("affiche plusieurs relances et permet de les réordonner", () => {
    const onReorder = vi.fn();
    renderUi(
      <QueuedTurns
        turns={[
          queuedTurn("q-1", "compare les deux cartes"),
          queuedTurn("q-2", "prépare ensuite la légende"),
        ]}
        onSteer={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
        followUpMode="queue"
        onFollowUpModeChange={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("queued-follow-up-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("compare les deux cartes");
    expect(rows[1]).toHaveTextContent("prépare ensuite la légende");

    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };
    fireEvent.dragStart(screen.getAllByRole("button", { name: t("queue.drag") })[0], { dataTransfer });
    fireEvent.dragOver(rows[1], { dataTransfer });
    fireEvent.drop(rows[1], { dataTransfer });
    expect(onReorder).toHaveBeenCalledWith("q-1", "q-2");
  });

  it("garde Steer direct et place Modifier dans le menu secondaire", () => {
    const onSteer = vi.fn();
    const onEdit = vi.fn();
    renderUi(
      <QueuedTurns
        turns={[queuedTurn("q-1", "corrige le titre")]}
        onSteer={onSteer}
        onEdit={onEdit}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        followUpMode="queue"
        onFollowUpModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: t("queue.send-now") }));
    expect(onSteer).toHaveBeenCalledWith("q-1");

    fireEvent.click(screen.getByRole("button", { name: t("queue.more") }));
    fireEvent.click(screen.getByRole("menuitem", { name: t("queue.edit") }));
    expect(onEdit).toHaveBeenCalledWith("q-1");
  });
});
