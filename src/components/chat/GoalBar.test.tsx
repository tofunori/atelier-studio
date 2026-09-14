import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalBar, fmtGoalTime, type GoalInfo } from "./GoalBar";
import { t } from "../../lib/i18n";
const goal: GoalInfo = { objective: "Comparer les six variantes\nSans changer la référence", status: "active", tokensUsed: 0, tokenBudget: null, timeUsedSeconds: 754 };
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("goal capsule", () => {
  it("ticks from the native elapsed time and freezes when paused", () => {
    vi.useFakeTimers();
    const props = { onGoal: vi.fn(), onStop: vi.fn() };
    const ui = render(<GoalBar goal={goal} {...props} />);
    expect(screen.getByText("12:34")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("12:37")).toBeTruthy();
    ui.rerender(<GoalBar goal={{ ...goal, status: "paused", timeUsedSeconds: 757 }} {...props} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("12:37")).toBeTruthy();
    expect(fmtGoalTime(3601)).toBe("1:00:01");
  });
  it("edits the complete multiline objective without submitting the prompt", () => {
    const onGoal = vi.fn(); const submit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={submit}><GoalBar goal={goal} onGoal={onGoal} onStop={vi.fn()} /></form>);
    fireEvent.click(screen.getByRole("button", { name: t("goal.edit") }));
    const input = screen.getByRole("textbox");
    expect((input as HTMLTextAreaElement).value).toBe(goal.objective);
    fireEvent.change(input, { target: { value: "Nouvel objectif\nDétaillé" } });
    fireEvent.click(screen.getByRole("button", { name: t("goal.update") }));
    expect(onGoal).toHaveBeenCalledWith("set", "Nouvel objectif\nDétaillé", "active");
    expect(submit).not.toHaveBeenCalled();
  });
  it("offers icon-only pause, edit and stop without opening details", () => {
    const onGoal = vi.fn(); const onStop = vi.fn();
    render(<GoalBar goal={goal} onGoal={onGoal} onStop={onStop} />);
    const pause = screen.getByRole("button", { name: t("goal.pause") });
    expect(pause.textContent).toBe("");
    fireEvent.click(pause);
    expect(onGoal).toHaveBeenCalledWith("set", goal.objective, "paused");
    fireEvent.click(screen.getByRole("button", { name: t("goal.stop") }));
    expect(onGoal).toHaveBeenCalledWith("clear");
    expect(onStop).toHaveBeenCalledOnce();
  });
});
