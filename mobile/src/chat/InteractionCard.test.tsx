import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractionCard } from "./InteractionCard.tsx";

describe("InteractionCard", () => {
  it("anti double-submit", async () => {
    let calls = 0;
    const onRespond = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
    });
    render(
      <InteractionCard
        threadId="t"
        payload={{
          requestId: "r1",
          interactionType: "approval",
          title: "OK?",
          state: "pending",
        }}
        onRespond={onRespond}
      />,
    );
    const allow = screen.getByRole("button", { name: "Autoriser" });
    fireEvent.click(allow);
    fireEvent.click(allow);
    await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(1));
    expect(calls).toBe(1);
  });

  it("terminal state hides actions", () => {
    render(
      <InteractionCard
        threadId="t"
        payload={{
          requestId: "r1",
          interactionType: "approval",
          title: "OK?",
          state: "answered",
          answerSummary: "Oui",
        }}
        onRespond={async () => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Autoriser" })).toBeNull();
    expect(screen.getByText("Oui")).toBeTruthy();
  });
});
