// Section Intégrations : un brouillon local, UN bouton Enregistrer qui envoie
// la configuration entière (`saveIntegrations`), et le refus du serveur
// affiché sans perdre la saisie. La réponse arrive par le store
// lib/integrations (message `integrations`), jamais par la section elle-même.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("../../../lib/wsBus", () => ({ wsSend: vi.fn(() => true) }));

import { renderUi, resetTestState } from "../../../test/render";
import { setLanguage } from "../../../lib/i18n";
import { DEFAULT_SETTINGS } from "../../../lib/settings";
import {
  applyIntegrationsMessage, resetIntegrationsForTests, setIntegrationsForTests,
  type IntegrationsConfig,
} from "../../../lib/integrations";
import { wsSend } from "../../../lib/wsBus";
import type { SectionProps } from "../shared";
import Integrations, { configFromDraft, draftFromConfig } from "./Integrations";

// Base UI (Select) consulte l'API Web Animations, absente de jsdom.
const originalGetAnimations = Element.prototype.getAnimations;
beforeAll(() => { Element.prototype.getAnimations = () => []; });
afterAll(() => {
  if (originalGetAnimations) Element.prototype.getAnimations = originalGetAnimations;
  else delete (Element.prototype as Partial<Element>).getAnimations;
});

const CONFIG: IntegrationsConfig = {
  ragdoc: { host: "nas", root: "/srv/ragdoc" },
  gbrain: { sshHost: "nas" },
};

beforeEach(() => {
  resetTestState();
  setLanguage("fr");
  setIntegrationsForTests({ ragdoc: true, gbrain: "ssh", zoteroDir: "/Users/x/Zotero", zoteroFound: false }, CONFIG);
});
afterEach(() => {
  cleanup();
  resetIntegrationsForTests();
  vi.clearAllMocks();
});

function props(over: Partial<SectionProps> = {}): SectionProps {
  const ws = { readyState: 1 } as unknown as WebSocket;
  return { s: { ...DEFAULT_SETTINGS }, set: vi.fn(), ws, onSaved: vi.fn(), ...over };
}

// les rangées portent aussi leur intitulé (role=group) : on vise le champ
const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement;
const sentTypes = () => vi.mocked(wsSend).mock.calls.map(([msg]) => (msg as { type: string }).type);

describe("Intégrations — brouillon ↔ configuration", () => {
  it("retire les champs vides et les sections vides", () => {
    const draft = draftFromConfig({});
    expect(draft.gbrainMode).toBe("off");
    expect(configFromDraft(draft)).toEqual({});
    expect(configFromDraft({ ...draft, narval: "  narval  ", crossrefMailto: " " })).toEqual({
      compute: { clusters: { narval: "narval" } },
    });
  });

  it("gbrain : « sur ce Mac » = sshHost vide, « par SSH » = l'hôte", () => {
    expect(draftFromConfig({ gbrain: { sshHost: "" } }).gbrainMode).toBe("local");
    expect(draftFromConfig({ gbrain: { sshHost: "nas" } }).gbrainMode).toBe("ssh");
    const draft = draftFromConfig({});
    expect(configFromDraft({ ...draft, gbrainMode: "local", gbrainHost: "ignoré" })).toEqual({ gbrain: { sshHost: "" } });
    expect(configFromDraft({ ...draft, gbrainMode: "ssh", gbrainHost: " nas " })).toEqual({ gbrain: { sshHost: "nas" } });
  });

  it("aller-retour sans perte d'une configuration complète", () => {
    const full: IntegrationsConfig = {
      ragdoc: { host: "nas", root: "/srv/ragdoc" },
      gbrain: { sshHost: "" },
      compute: { nasHost: "nas", clusterGateway: "gw", clusters: { narval: "narval", rorqual: "rorqual" } },
      crossrefMailto: "a@b.c",
      zoteroDir: "/Volumes/Zotero",
    };
    expect(configFromDraft(draftFromConfig(full))).toEqual(full);
  });
});

describe("Intégrations — section", () => {
  it("redemande l'état à l'ouverture ; rien à enregistrer tant que rien ne change", () => {
    renderUi(<Integrations {...props()} />);
    expect(sentTypes()).toEqual(["integrations"]);
    expect(saveButton().disabled).toBe(true);
    // les champs reprennent la configuration en vigueur
    expect((field("Ragdoc · Hôte SSH") as HTMLInputElement).value).toBe("nas");
    expect((field("gbrain · Hôte SSH") as HTMLInputElement).value).toBe("nas");
  });

  it("montre l'état effectif, et le dossier Zotero détecté en indication", () => {
    renderUi(<Integrations {...props()} />);
    expect(screen.getAllByText("Actif")).toHaveLength(2); // Ragdoc, gbrain
    expect(screen.getAllByText("Non configuré")).toHaveLength(4); // NAS, Narval, Rorqual, Crossref
    expect(screen.getByText("Introuvable")).toBeTruthy();
    expect(screen.getByText("/Users/x/Zotero · emplacement par défaut")).toBeTruthy();
    expect(field("Dossier de données Zotero").getAttribute("placeholder")).toBe("/Users/x/Zotero");
  });

  it("Enregistrer envoie la configuration ENTIÈRE, puis se referme sur la réponse", () => {
    const onSaved = vi.fn();
    renderUi(<Integrations {...props({ onSaved })} />);
    fireEvent.change(field("Hôte du NAS"), { target: { value: " nas2 " } });
    expect(screen.getByText("Modifications non enregistrées.")).toBeTruthy();
    fireEvent.click(saveButton());
    const expected = { ...CONFIG, compute: { nasHost: "nas2" } };
    expect(vi.mocked(wsSend)).toHaveBeenLastCalledWith({ type: "saveIntegrations", config: expected });
    expect(screen.getByText("Enregistrement…")).toBeTruthy();

    act(() => applyIntegrationsMessage({ type: "integrations", config: expected, effective: { ragdoc: true, gbrain: "ssh", nasHost: "nas2" } }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText("Ces réglages s’appliquent à l’enregistrement.")).toBeTruthy();
  });

  it("un refus s'affiche et garde la saisie", () => {
    const onSaved = vi.fn();
    renderUi(<Integrations {...props({ onSaved })} />);
    fireEvent.change(field("Hôte du NAS"), { target: { value: "-oProxyCommand=x" } });
    fireEvent.click(saveButton());
    act(() => applyIntegrationsMessage({
      type: "integrations", config: CONFIG, effective: { ragdoc: true, gbrain: "ssh" }, error: "hôte SSH invalide",
    }));
    expect(screen.getByText("Enregistrement refusé : hôte SSH invalide")).toBeTruthy();
    expect((field("Hôte du NAS") as HTMLInputElement).value).toBe("-oProxyCommand=x");
    expect(onSaved).not.toHaveBeenCalled();
    // retoucher le champ efface le refus
    fireEvent.change(field("Hôte du NAS"), { target: { value: "nas" } });
    expect(screen.queryByText(/Enregistrement refusé/)).toBeNull();
  });

  it("un message venu d'ailleurs n'écrase pas une saisie en cours", () => {
    renderUi(<Integrations {...props()} />);
    fireEvent.change(field("Alias Narval"), { target: { value: "narval" } });
    act(() => applyIntegrationsMessage({ type: "integrations", config: CONFIG, effective: { ragdoc: true, gbrain: "ssh" } }));
    expect((field("Alias Narval") as HTMLInputElement).value).toBe("narval");
  });

  it("« Par SSH » sans hôte bloque l'enregistrement", () => {
    renderUi(<Integrations {...props()} />);
    fireEvent.change(field("gbrain · Hôte SSH"), { target: { value: "  " } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(sentTypes()).not.toContain("saveIntegrations");
  });

  it("serveur déconnecté : bandeau, et rien ne part", () => {
    renderUi(<Integrations {...props({ ws: null })} />);
    expect(screen.getByText(/Sidecar déconnecté/)).toBeTruthy();
    fireEvent.change(field("Hôte du NAS"), { target: { value: "nas" } });
    expect(saveButton().disabled).toBe(true);
  });
});
