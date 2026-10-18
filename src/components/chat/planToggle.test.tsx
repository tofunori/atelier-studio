// Sortie du mode Plan par l'entrée « Mode plan » du menu « + ». Le menu
// basculait entre plan et bypassPermissions : un fil en acceptEdits (le
// défaut) qui entrait puis sortait de Plan tournait ensuite en accès complet
// (--dangerously-skip-permissions côté Claude, danger-full-access côté
// Codex). On revient au mode d'avant Plan, sinon à acceptEdits, jamais à
// l'accès complet.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { makeProviderInfo } from "../../test/fixtures";
import { t } from "../../lib/i18n";
import { modeApresPlan } from "./ComposerControls";

const TOUS = ["default", "acceptEdits", "plan", "bypassPermissions"];

describe("modeApresPlan", () => {
  it("rend le mode d'avant Plan", () => {
    expect(modeApresPlan("acceptEdits", TOUS)).toBe("acceptEdits");
    expect(modeApresPlan("default", TOUS)).toBe("default");
  });

  it("ne rend jamais l'accès complet, même s'il précédait Plan", () => {
    expect(modeApresPlan("bypassPermissions", TOUS)).toBe("acceptEdits");
  });

  it("sans mode précédent connu, revient au défaut acceptEdits", () => {
    expect(modeApresPlan(null, TOUS)).toBe("acceptEdits");
    expect(modeApresPlan(undefined, TOUS)).toBe("acceptEdits");
    expect(modeApresPlan("plan", TOUS)).toBe("acceptEdits");
  });

  it("ignore un mode précédent que le fournisseur n'offre pas", () => {
    expect(modeApresPlan("acceptEdits", ["default", "plan", "bypassPermissions"])).toBe("default");
    expect(modeApresPlan("default", ["acceptEdits", "plan"])).toBe("acceptEdits");
  });
});

type Envoi = Parameters<typeof Chat>[0]["onSubmit"];

function chatProps(defaultPermissionMode: string, onSubmit: Mock<Envoi>): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-plan",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit,
    providers: [makeProviderInfo()],
  };
}

const ta = () => document.querySelector(".composer textarea") as HTMLTextAreaElement;

async function basculerPlan() {
  fireEvent.click(screen.getByTitle(t("action.add-file-image")));
  await waitFor(() => expect(document.querySelector(".plus-up")).toBeTruthy());
  const menu = document.querySelector(".plus-up") as HTMLElement;
  const entree = within(menu).getByText(t("permission.plan"));
  fireEvent.click(entree);
  await waitFor(() => expect(document.querySelector(".plus-up")).toBeNull());
}

function envoyer(onSubmit: Mock<Envoi>, texte: string): string {
  fireEvent.change(ta(), { target: { value: texte } });
  fireEvent.keyDown(ta(), { key: "Enter" });
  const calls = onSubmit.mock.calls;
  return calls[calls.length - 1][4] as string;
}

beforeEach(resetTestState);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("menu « + » — entrée Mode plan", () => {
  it("acceptEdits → Plan → sortie : revient à acceptEdits, pas à l'accès complet", async () => {
    const onSubmit = vi.fn<Envoi>();
    renderUi(<Chat {...chatProps("acceptEdits", onSubmit)} />);
    expect(envoyer(onSubmit, "avant")).toBe("acceptEdits");
    await basculerPlan();
    expect(envoyer(onSubmit, "en plan")).toBe("plan");
    await basculerPlan();
    expect(envoyer(onSubmit, "après")).toBe("acceptEdits");
  });

  it("Demander → Plan → sortie : revient à Demander", async () => {
    const onSubmit = vi.fn<Envoi>();
    renderUi(<Chat {...chatProps("default", onSubmit)} />);
    await basculerPlan();
    expect(envoyer(onSubmit, "en plan")).toBe("plan");
    await basculerPlan();
    expect(envoyer(onSubmit, "après")).toBe("default");
  });

  it("accès complet → Plan → sortie : acceptEdits, l'accès complet se rechoisit au sélecteur", async () => {
    const onSubmit = vi.fn<Envoi>();
    renderUi(<Chat {...chatProps("bypassPermissions", onSubmit)} />);
    await basculerPlan();
    expect(envoyer(onSubmit, "en plan")).toBe("plan");
    await basculerPlan();
    expect(envoyer(onSubmit, "après")).toBe("acceptEdits");
  });
});
