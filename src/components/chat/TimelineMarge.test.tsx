// La marge annotée (design 2026-08-21) : une seule colonne à gauche du
// transcript porte les repères de prompt, les épingles et leur nom. Elle
// remplace le rail de pastilles (quatre formes + couleur libre), dont la
// variation n'encodait rien.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { events, FIXED_TS } from "../../test/fixtures";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [],
    workingSince: null,
    commands: [],
    files: [],
    recentFiles: [],
    zoteroItems: [],
    injectText: null,
    onInjected: vi.fn(),
    attachments: [],
    onRemoveAttachment: vi.fn(),
    onQuote: vi.fn(),
    threadId: "thread-A",
    onPasteImage: vi.fn(),
    onPasteText: vi.fn(),
    onStop: vi.fn(),
    layout: "chat",
    onToggleExpand: vi.fn(),
    usage: null,
    onRevert: vi.fn(),
    onFork: vi.fn(),
    onEditSend: vi.fn(),
    onNewChat: vi.fn(),
    onOpenProject: vi.fn(),
    highlights: [],
    defaults: {
      defaultProvider: "claude",
      defaultModel: {},
      defaultEffort: {},
      defaultPermissionMode: "bypassPermissions",
    },
    pins: [],
    onStylePin: vi.fn(),
    onTogglePin: vi.fn(),
    disabled: false,
    onSubmit: vi.fn(),
    ...over,
  } as Parameters<typeof Chat>[0];
}

const TOUR = [
  events.user("Vérifie d'où vient le −0,00975", FIXED_TS),
  events.text("La découverte : le −0,00975 vient de l'ancien run.", FIXED_TS + 500),
];

beforeEach(() => resetTestState());
afterEach(() => cleanup());

describe("la marge annotée", () => {
  it("dépose un repère pour chaque prompt, sans que rien ne soit demandé", () => {
    renderUi(<Chat {...chatProps({ events: TOUR })} />);
    const reperes = document.querySelectorAll('.tl-mark[data-mark="prompt"]');
    expect(reperes).toHaveLength(1);
  });

  // Décision 2026-08-21 (Thierry) : l'accent ne double plus tout le côté du
  // message — sur un long message le filet devenait une barre d'un écran de
  // haut. La marge seule porte l'épingle.
  it("marque l'épingle dans la marge, et ne peint rien le long du message", () => {
    renderUi(<Chat {...chatProps({
      events: TOUR,
      pins: [{ index: 1, label: "La découverte", anchor: "La découverte" }],
    })} />);
    expect(document.querySelectorAll('.tl-mark[data-mark="pin"]')).toHaveLength(1);
    expect(document.querySelector(".timeline-virtual-row.is-pinned")).toBeNull();
  });

  it("nomme l'épingle en toutes lettres — le nom n'attend plus le survol", () => {
    renderUi(<Chat {...chatProps({
      events: TOUR,
      pins: [{ index: 1, label: "La découverte", anchor: "La découverte" }],
    })} />);
    expect(screen.getByRole("button", { name: /La découverte/ })).toBeTruthy();
  });

  it("n'offre plus de forme d'épingle à choisir dans le menu de l'entrée", () => {
    renderUi(<Chat {...chatProps({
      events: TOUR,
      pins: [{ index: 1, label: "La découverte", anchor: "La découverte" }],
    })} />);
    fireEvent.contextMenu(document.querySelector('.tl-mark[data-mark="pin"]')!);
    expect(document.querySelector(".pin-menu")).toBeTruthy();
    expect(document.querySelector(".pin-style-btn")).toBeNull();
  });
});
