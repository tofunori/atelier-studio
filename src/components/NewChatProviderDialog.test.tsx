import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProviderInfo } from "../lib/providers";
import { t } from "../lib/i18n";
import { DeliveryStatusAnnouncer } from "./DeliveryStatusAnnouncer";
import { NewChatProviderDialog } from "./NewChatProviderDialog";

const info = (id: string, ok: boolean): ProviderInfo => ({
  id: id as ProviderInfo["id"], label: id === "codex" ? "Codex" : id, kind: "cli", version: null, ok,
  models: [], defaultModel: "", efforts: [],
});

describe("NewChatProviderDialog", () => {
  it("liste les cinq agents, désactive ceux qui ne sont pas détectés", async () => {
    const onCreate = vi.fn();
    render(<NewChatProviderDialog providers={[info("codex", true), info("kimi", false)]} onCreate={onCreate} onClose={() => {}} />);
    // la vraie modale (portail Base UI), jamais un substitut en ligne
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-slot")).toBe("dialog-content"));
    const cards = document.querySelectorAll<HTMLButtonElement>(".provider-new-card");
    expect([...cards].map((card) => card.querySelector("span")?.textContent))
      .toEqual(["Claude", "Codex", "Grok", "kimi", "Opencode"]);
    const kimi = [...cards].find((card) => card.textContent?.includes("kimi"))!;
    expect(kimi.disabled).toBe(true);
    expect(kimi.textContent).toContain(t("app.provider-unavailable"));
    fireEvent.click(screen.getByText("Codex"));
    expect(onCreate).toHaveBeenCalledWith("codex");
  });

  it("se ferme avec Échap", async () => {
    const onClose = vi.fn();
    render(<NewChatProviderDialog providers={[]} onCreate={() => {}} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("DeliveryStatusAnnouncer", () => {
  it("annonce l'état du dernier envoi dans une région live invisible", () => {
    const { container, rerender } = render(<DeliveryStatusAnnouncer status="received" />);
    const region = container.querySelector(".sr-only")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("data-delivery-status")).toBe("received");
    expect(region.textContent).toBe("Envoi reçu par Atelier");
    rerender(<DeliveryStatusAnnouncer status="uncertain" />);
    expect(region.textContent).toBe("Effet fournisseur incertain, vérification requise");
  });
});
