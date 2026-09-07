import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { ActivityGroup } from "./turns";
import { renderUi, resetTestState } from "../../test/render";
import { events } from "../../test/fixtures";
import { setLanguage } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";

type Action = Extract<AgentEvent, { kind: "tool_update" }>;
const command = (id: string, detail: string, status: string): Action =>
  events.tool({ id, name: "Bash", detail, status }) as Action;
const group = (actions: Action[], live: boolean) => <ActivityGroup
  actions={actions} live={live} open onToggle={() => {}}
  renderToolLine={action => <span>{"id" in action ? action.id : action.name}</span>} />;
const label = () => document.querySelector(".ui-activity-label")?.textContent;
beforeEach(() => { resetTestState(); setLanguage("fr"); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("libellé des commandes pendant une rafale", () => {
  it("garde le libellé et son support pour un appel de 40 ms, sans retarder son résultat", () => {
    const a = command("a", "echo A", "completed");
    const b = command("b", "echo B", "inProgress");
    const view = renderUi(group([a], false));
    const initial = label();
    const trigger = document.querySelector(".ui-activity-trigger");
    const paintRow = document.querySelector(".tool-ticker-row");
    view.rerender(group([a, b], true));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-running");
    act(() => { vi.advanceTimersByTime(40); });
    view.rerender(group([a, { ...b, status: "completed" }], false));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-completed");
    expect(label()).toBe(initial);
    expect(document.querySelector(".tool-ticker-row")).toBe(paintRow);
    act(() => { vi.advanceTimersByTime(160); });
    expect(label()).toContain("2 commandes exécutées");
    expect(document.querySelector(".ui-activity-trigger")).toBe(trigger);
    expect(document.querySelector(".tool-ticker-row")).toBe(paintRow);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("publie le cumul même si la rafale ne laisse jamais 160 ms de silence", () => {
    const actions = [command("1", "echo 1", "completed")];
    const view = renderUi(group(actions, false));
    for (let i = 2; i <= 6; i++) {
      actions.push(command(String(i), `echo ${i}`, "completed"));
      view.rerender(group([...actions], false));
      act(() => { vi.advanceTimersByTime(40); });
    }
    expect(label()).toContain("5 commandes exécutées");
    act(() => { vi.advanceTimersByTime(160); });
    expect(label()).toContain("6 commandes exécutées");
  });

  it("montre un appel durable puis suit celui qui reste réellement en cours", () => {
    const a = command("a", "sleep 18", "inProgress");
    const b = command("b", "sleep 12", "inProgress");
    const view = renderUi(group([a, b], true));
    expect(label()).toContain("sleep 12");
    view.rerender(group([a, { ...b, status: "completed" }], true));
    act(() => { vi.advanceTimersByTime(160); });
    expect(label()).toContain("sleep 18");
    expect(document.querySelector(".tool-ticker-reel")).toBeNull();
    view.rerender(group([{ ...a, status: "completed" }, { ...b, status: "failed", exitCode: 3 }], false));
    expect(document.querySelector(".ui-activity")).toHaveClass("is-failed");
  });
});
