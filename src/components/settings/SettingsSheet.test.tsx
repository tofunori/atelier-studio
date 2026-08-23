// Feuille modale des réglages (lot A) : l'app reste montée derrière.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { renderUi, resetTestState } from "../../test/render";
import { setLanguage } from "../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { SettingsSheet } from "./SettingsSheet";

beforeEach(() => { resetTestState(); setLanguage("fr"); vi.clearAllMocks(); });
afterEach(cleanup);

function props(over = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    settings: { ...DEFAULT_SETTINGS },
    onChange: vi.fn(),
    ws: null,
    ...over,
  };
}

describe("SettingsSheet", () => {
  it("ne rend rien quand elle est fermée", () => {
    const { container } = renderUi(<SettingsSheet {...props({ open: false })} />);
    expect(container.querySelector(".settings-page")).toBeNull();
  });

  it("Échap ferme la feuille quand le focus n'est pas dans un champ", () => {
    const onClose = vi.fn();
    renderUi(<SettingsSheet {...props({ onClose })} />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Échap NE ferme PAS pendant une saisie — contrat verrouillé", () => {
    const onClose = vi.fn();
    renderUi(<SettingsSheet {...props({ onClose })} />);
    const champ = document.createElement("input");
    document.body.appendChild(champ);
    champ.focus();
    fireEvent.keyDown(champ, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pose le voile et l'élévation par leurs jetons, pas en dur", () => {
    const { baseElement } = renderUi(<SettingsSheet {...props()} />);
    const html = baseElement.innerHTML;
    expect(html).not.toMatch(/rgba\(0,\s*0,\s*0/);
  });
});
