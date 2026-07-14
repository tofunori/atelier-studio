import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalBar, type GoalInfo } from "./GoalBar";

afterEach(cleanup);

const goal: GoalInfo = {
  objective: "Migrer le design system",
  status: "active",
  tokenBudget: 10_000,
  tokensUsed: 2_500,
  timeUsedSeconds: 90,
};

describe("GoalBar", () => {
  it("rend une progression shadcn uniquement pour un budget token réel", () => {
    const { rerender } = render(<GoalBar goal={goal} onGoal={vi.fn()} onStop={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const progress = screen.getByRole("progressbar", { name: /tokens/i });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(progress).toHaveAttribute("data-slot", "progress");

    rerender(<GoalBar goal={{ ...goal, tokenBudget: null }} onGoal={vi.fn()} onStop={vi.fn()} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
