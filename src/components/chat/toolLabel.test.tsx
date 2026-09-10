import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { ActivityStep } from "./ActivityBatch";
import { renderUi, resetTestState } from "../../test/render";
import { events } from "../../test/fixtures";
import { setLanguage } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import type { ToolAction } from "../../lib/chat/turnViewModel";

type Action = Extract<AgentEvent, { kind: "tool_update" }>;
const command = (id: string, detail: string, status: string): Action =>
  events.tool({ id, name: "Bash", detail, status }) as Action;
const step = (actions: Action[], active: boolean) => <ActivityStep
  actions={actions} open onToggle={() => {}} active={active}
  liveLabel={active ? "Commande en cours…" : undefined} liveSince={Date.now()}
  onOpenAgent={() => {}}
  renderToolLine={(action: ToolAction) => <span>{"id" in action ? action.id : action.name}</span>} />;
const label = () => document.querySelector(".ui-activity-label")?.textContent;
beforeEach(() => { resetTestState(); setLanguage("fr"); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

// Le libellé de synthèse d'une étape attend 160 ms de STABILITÉ : sans ce
// délai, une rafale d'appels de 40 ms faisait clignoter la ligne repliée.
describe("libellé d'une étape pendant une rafale", () => {
  it("garde le libellé et son support pour un appel de 40 ms, sans retarder son résultat", () => {
    const a = command("a", "echo A", "completed");
    const b = command("b", "echo B", "completed");
    const c = command("c", "echo C", "inProgress");
    const view = renderUi(step([a, b, c], false));
    const initial = label();
    const trigger = document.querySelector(".ui-activity-trigger");
    view.rerender(step([a, b, c, command("d", "echo D", "inProgress")], true));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-running");
    act(() => { vi.advanceTimersByTime(40); });
    // Étape active repliée : la ligne unique porte l'action en cours, pas la
    // synthèse (qui revient, stabilisée 160 ms, quand l'étape se pose).
    expect(label()).toContain("Commande en cours");
    expect(label()).not.toBe(initial);
    view.rerender(step([a, b, c, command("d", "echo D", "completed")], false));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-completed");
    act(() => { vi.advanceTimersByTime(160); });
    expect(label()).toContain("4 commandes exécutées");
    expect(document.querySelector(".ui-activity-trigger")).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("publie le cumul même si la rafale ne laisse jamais 160 ms de silence", () => {
    const actions = [command("1", "echo 1", "completed"), command("2", "echo 2", "completed"),
      command("3", "echo 3", "completed")];
    const view = renderUi(step([...actions], false));
    for (let i = 4; i <= 8; i++) {
      actions.push(command(String(i), `echo ${i}`, "completed"));
      view.rerender(step([...actions], false));
      act(() => { vi.advanceTimersByTime(40); });
    }
    expect(label()).toContain("7 commandes exécutées");
    act(() => { vi.advanceTimersByTime(160); });
    expect(label()).toContain("8 commandes exécutées");
  });

  it("l'étape active porte l'unique ligne vivante et vire au rouge à l'échec", () => {
    const a = command("a", "sleep 18", "inProgress");
    const b = command("b", "sleep 12", "inProgress");
    const c = command("c", "sleep 4", "inProgress");
    const view = renderUi(step([a, b, c], true));
    const live = document.querySelectorAll(".activity-cluster-live [role=status]");
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toContain("Commande en cours");
    view.rerender(step([{ ...a, status: "completed" }, { ...b, status: "failed", exitCode: 3 },
      { ...c, status: "completed" }], false));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-failed");
    expect(document.querySelector(".activity-cluster-live")).toBeNull();
  });
});
