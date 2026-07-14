import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PairingScreen } from "./PairingScreen.tsx";

describe("PairingScreen navigation", () => {
  it("always exposes an explicit return action", () => {
    const onBack = vi.fn();
    render(
      <PairingScreen
        gatewayUrl="https://mac.example.test"
        onGatewayUrlChange={vi.fn()}
        onPair={vi.fn().mockResolvedValue(undefined)}
        onBack={onBack}
        busy={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
