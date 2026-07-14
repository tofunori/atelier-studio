import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
  Toaster: (props: { position?: string; closeButton?: boolean }) => (
    <div data-sonner-toaster data-position={props.position} data-close-button={props.closeButton || undefined} />
  ),
}));

import { AppOverlays } from "./AppOverlays";
import { showError, showInfo, showSuccess, showUndo } from "./toast";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("toasts produit", () => {
  it("monte exactement un Toaster global", async () => {
    render(<AppOverlays><main>Atelier</main></AppOverlays>);
    await waitFor(() => expect(document.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1));
    const toasters = document.querySelectorAll("[data-sonner-toaster]");
    expect(toasters).toHaveLength(1);
    expect(toasters[0]).toHaveAttribute("data-position", "bottom-right");
  });

  it("cartographie succès, erreur et information", async () => {
    await Promise.all([
      showSuccess("Sauvegardé"),
      showError("Échec"),
      showInfo("Synchronisation"),
    ]);
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Sauvegardé");
      expect(toastMock.error).toHaveBeenCalledWith("Échec");
      expect(toastMock.info).toHaveBeenCalledWith("Synchronisation");
    });
  });

  it("expose une action Annuler fonctionnelle", async () => {
    const onUndo = vi.fn();
    toastMock.mockImplementation((_message: string, options: { action: { label: string; onClick: () => void } }) => {
      return options.action;
    });
    await showUndo("Élément supprimé", onUndo);
    const options = toastMock.mock.calls[0][1];
    expect(options.action.label).toBe("Annuler");
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
