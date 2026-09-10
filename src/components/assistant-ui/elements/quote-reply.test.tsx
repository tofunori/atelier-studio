import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderUi } from "@/test/render";
import { QuoteReply } from "./quote-reply";

afterEach(cleanup);

describe("official quote reply element", () => {
  it("keeps the selected passage visible and dispatches the chosen action", () => {
    const onAction = vi.fn();
    renderUi(
      <QuoteReply
        before="Before "
        selection="selected passage"
        after=" after"
        quoted="selected passage"
        toolbarVisible
        actions={[{ key: "quote", label: "Quote", icon: "quote" }]}
        onAction={onAction}
      />,
    );

    expect(screen.getAllByText("selected passage")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(onAction).toHaveBeenCalledWith("quote");
  });
});
