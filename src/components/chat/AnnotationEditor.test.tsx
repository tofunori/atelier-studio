// Popover d'annotation, refonte « Filet » (2026-08-28). Deux verbes vivent
// dans la rangée : ⏎ range le commentaire pour le prochain message, ⌘⏎ le pose
// à l'agent tout de suite. Ce fichier verrouille le second — c'est lui qui
// traverse le plus de couches (marque locale → fiche durable → composer).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import { renderUi, resetTestState } from "../../test/render";
import { events } from "../../test/fixtures";
import { t } from "../../lib/i18n";
import { buildAnnotationBlock, type Mark } from "../../lib/annotations";

const PASSAGE = "Le seuil hypsométrique fixe la limite de la zone d'accumulation.";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [events.user("Explique le seuil."), events.text(PASSAGE), events.done()],
    workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: "thread-A",
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...over,
  };
}

/** Sélectionne un passage rendu et ouvre l'éditeur d'annotation, comme le
 *  ferait un glissement de souris sur la réponse. */
async function openEditor(fragment: string): Promise<HTMLTextAreaElement> {
  const node = [...document.querySelectorAll(".messages p, .messages li, .messages div")]
    .flatMap((el) => [...el.childNodes])
    .find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes(fragment));
  if (!node) throw new Error("passage introuvable dans le rendu");

  const start = node.textContent!.indexOf(fragment);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + fragment.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  await act(async () => {
    fireEvent.mouseUp(document.querySelector(".messages")!);
    await new Promise((r) => setTimeout(r, 0)); // le handler diffère d'un tick
  });

  fireEvent.mouseDown(await screen.findByText(t("chat.annotate")));
  return await waitFor(() => {
    const field = document.querySelector(".anno-editor-note") as HTMLTextAreaElement | null;
    if (!field) throw new Error("éditeur d'annotation absent");
    return field;
  });
}

beforeEach(() => {
  resetTestState();
  // jsdom ne mesure rien : le handler de sélection place le popover à partir
  // du rectangle du Range, absent de l'implémentation.
  const rect = {
    x: 0, y: 0, left: 120, top: 240, right: 320, bottom: 258,
    width: 200, height: 18, toJSON: () => ({}),
  } as DOMRect;
  const proto = Range.prototype as unknown as {
    getBoundingClientRect: () => DOMRect;
    getClientRects: () => DOMRect[];
  };
  proto.getBoundingClientRect = () => rect;
  proto.getClientRects = () => [rect];
});
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

describe("popover d'annotation — annoter et envoyer", () => {
  it("⏎ range le commentaire sans rien envoyer", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit })} />);

    const field = await openEditor("seuil hypsométrique");
    fireEvent.change(field, { target: { value: "précise la référence" } });
    fireEvent.keyDown(field, { key: "Enter" });

    // le commentaire attend le prochain message : pilule dans le composer,
    // aucun tour parti
    await waitFor(() => expect(document.querySelector(".anno-pill-dot")).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fermer l’annotation abandonne le brouillon sans envoyer", async () => {
    const onSubmit=vi.fn();
    renderUi(<Chat {...chatProps({onSubmit})}/>);
    const field=await openEditor("seuil hypsométrique");
    fireEvent.change(field,{target:{value:"brouillon"}});
    fireEvent.click(within(screen.getByRole("dialog",{name:t("chat.annotate")})).getByRole("button",{name:t("action.close")}));
    expect(document.querySelector(".anno-editor")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("le bouton d'envoi part avec le commentaire qu'on vient d'écrire", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit })} />);

    const field = await openEditor("seuil hypsométrique");
    fireEvent.change(field, { target: { value: "précise la référence" } });
    fireEvent.click(screen.getByTitle(t("chat.annotation-send")));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [prompt, provider, , , permissionMode, mode] = onSubmit.mock.calls[0];
    // le piège de la refonte : `marks` n'est à jour qu'après le rendu — un
    // envoi dans le même tour partirait SANS ce commentaire
    expect(prompt).toContain("précise la référence");
    expect(prompt).toContain("seuil hypsométrique");
    // le composer reste seul juge du provider et du mode de suivi
    expect(provider).toBe("claude");
    expect(permissionMode).toBe("bypassPermissions");
    expect(mode).toBe("steer");
  });

  it("⌘⏎ fait le même envoi que le bouton", async () => {
    const onSubmit = vi.fn();
    renderUi(<Chat {...chatProps({ onSubmit })} />);

    const field = await openEditor("seuil hypsométrique");
    fireEvent.change(field, { target: { value: "trop vague" } });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toContain("trop vague");
  });

  it("la consigne écrite a disparu — elle vit en infobulle des actions", async () => {
    renderUi(<Chat {...chatProps()} />);
    await openEditor("seuil hypsométrique");

    expect(document.querySelector(".anno-editor-hint")).toBeNull();
    expect(screen.getByTitle(t("chat.annotate-hint"))).toBeTruthy();
    expect(screen.getByTitle(t("chat.annotation-send"))).toBeTruthy();
  });
});

// Une fois envoyée, l'annotation efface le surlignage du passage (saveMarks([]))
// : la bulle est la seule trace qui reste dans la conversation. Elle doit donc
// PORTER le passage, pas seulement y renvoyer.
describe("bulle d'un tour annoté", () => {
  const an = (text: string, note?: string): Mark =>
    note ? { text, kind: "an", note } : { text, kind: "an" };

  /** Rend un tour et rend la BULLE : l'aperçu de la marge porte le même
   *  texte, il ne doit pas se glisser dans les assertions. */
  function renderTurn(text: string): HTMLElement {
    renderUi(<Chat {...chatProps({ events: [events.user(text)] })} />);
    return document.querySelector(".user-bubble") as HTMLElement;
  }

  it("cite le passage au lieu de recracher le bloc destiné à l'agent", () => {
    const block = buildAnnotationBlock([an("explicite sur toute la série", "celle ci")]);
    const bubble = renderTurn(`${block}\n\nReprends la méthode.`);

    // la phrase adressée au modèle ne s'affiche plus dans la bulle
    expect(within(bubble).queryByText(/Annotations sur ma réponse/)).toBeNull();
    expect(document.querySelector(".anno-said-quote")?.textContent).toBe("explicite sur toute la série");
    expect(document.querySelector(".anno-said-note")?.textContent).toBe("celle ci");
    expect(document.querySelector(".anno-said-tail")?.textContent).toBe("Reprends la méthode.");
    // « [1] » seul ne numérote rien
    expect(document.querySelector(".anno-said-idx")).toBeNull();
  });

  it("numérote à partir de deux, et marque celles qui n'ont pas de commentaire", () => {
    renderTurn(buildAnnotationBlock([an("le seuil", "trop vague"), an("la fraction glaciaire")]));

    expect([...document.querySelectorAll(".anno-said-idx")].map((n) => n.textContent))
      .toEqual(["1", "2"]);
    expect(document.querySelector(".anno-said-note.is-empty")?.textContent)
      .toBe(t("chat.annotation-mute"));
    expect(document.querySelector(".anno-said-tail")).toBeNull();
  });

  it("un message ordinaire garde son rendu de bulle", () => {
    const bubble = renderTurn("Reprends la méthode à partir du seuil.");
    expect(document.querySelector(".anno-said")).toBeNull();
    expect(bubble.textContent).toBe("Reprends la méthode à partir du seuil.");
  });
});
