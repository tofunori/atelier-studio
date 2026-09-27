import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PairingScreen } from "./PairingScreen.tsx";

afterEach(cleanup);

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

describe("PairingScreen sans adresse connue", () => {
  it("déplie l'adresse du Mac et attend qu'elle soit remplie", () => {
    const onPair = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <PairingScreen
        gatewayUrl=""
        onGatewayUrlChange={vi.fn()}
        onPair={onPair}
        onBack={vi.fn()}
        busy={false}
        error={null}
      />,
    );
    // le champ est visible sans ouvrir « Options avancées »
    expect(screen.getByLabelText("Adresse du Mac")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code affiché sur le Mac"), { target: { value: "ABCD2345" } });
    const connect = screen.getByRole("button", { name: /Connecter l’iPhone/ }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);

    rerender(
      <PairingScreen
        gatewayUrl="https://mon-mac.ts.net:8443"
        onGatewayUrlChange={vi.fn()}
        onPair={onPair}
        onBack={vi.fn()}
        busy={false}
        error={null}
      />,
    );
    expect(connect.disabled).toBe(false);
    fireEvent.click(connect);
    expect(onPair).toHaveBeenCalledWith("ABCD2345", "iPhone");
  });
});
