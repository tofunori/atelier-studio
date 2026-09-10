import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_UI_GOAL_LIMITATIONS,
  AssistantUiGoalControls,
  type AssistantUiGoal,
} from "./AssistantUiGoalControls";

afterEach(cleanup);

const goal = (status: AssistantUiGoal["status"]): AssistantUiGoal => ({
  objective: "Vérifier la cohérence",
  status,
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
});

describe("AssistantUiGoalControls", () => {
  it("uses the official input and emits a real objective for set", () => {
    const onGoal = vi.fn();
    render(<AssistantUiGoalControls onGoal={onGoal} />);

    fireEvent.click(screen.getByRole("button", { name: "Définir" }));
    expect(onGoal).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("objectif");

    fireEvent.change(screen.getByRole("textbox", { name: "Objectif" }), {
      target: { value: "  Vérifier la cohérence  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Définir" }));
    expect(onGoal).toHaveBeenCalledWith("set", "Vérifier la cohérence", "active");
  });

  it("maps active goal to official AgentStatus and emits pause/clear", () => {
    const onGoal = vi.fn();
    render(<AssistantUiGoalControls goal={goal("active")} onGoal={onGoal} />);

    expect(screen.getByText("Vérifier la cohérence")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onGoal).toHaveBeenCalledWith("set", "Vérifier la cohérence", "paused");
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(onGoal).toHaveBeenCalledWith("clear");
  });

  it.each(["blocked", "usageLimited", "budgetLimited", "complete"] as const)(
    "does not invent a pause/resume action for %s",
    (status) => {
      const onGoal = vi.fn();
      render(<AssistantUiGoalControls goal={goal(status)} onGoal={onGoal} />);
      expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Reprendre" })).toBeNull();
      expect(screen.getByRole("button", { name: "Retirer" })).toBeInTheDocument();
    },
  );

  it("exposes the upstream limitation instead of claiming a native Goal element", () => {
    expect(ASSISTANT_UI_GOAL_LIMITATIONS.upstream).toMatch(/no goal .*element/u);
  });
});
