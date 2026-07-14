import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkingStatus } from "./WorkingStatus.tsx";

describe("WorkingStatus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("affiche immédiatement puis incrémente les secondes", () => {
    render(<WorkingStatus />);
    expect(screen.getByRole("status")).toHaveTextContent("Travaille· 0 s");
    act(() => vi.advanceTimersByTime(3100));
    expect(screen.getByRole("status")).toHaveTextContent("Travaille· 3 s");
  });
});
