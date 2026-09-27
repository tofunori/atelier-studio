import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { renderUi } from "../test/render";
import { consumeRagdocPromotion, requestRagdocPromotion } from "../lib/ragdocPromotion";
import { wsSend } from "../lib/wsBus";
import { resetIntegrationsForTests, setIntegrationsForTests } from "../lib/integrations";
import KnowledgeSurface from "./KnowledgeSurface";

// Dernières props reçues par la surface : ce que KnowledgeSurface lui confie.
const surface = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("../lib/wsBus", () => ({ wsSend: vi.fn(() => true), wsReady: () => true }));
vi.mock("./chat/KbSurface", () => ({
  default: (props: Record<string, unknown>) => { surface.props = props; return null; },
}));
vi.mock("./chat/kbActions", () => ({ useKbActions: () => ({ error: null }) }));

beforeEach(() => {
  // Ragdoc configuré (Réglages → Intégrations) : cas nominal de ces tests
  setIntegrationsForTests({ ragdoc: true });
});

afterEach(() => {
  cleanup();
  consumeRagdocPromotion();
  resetIntegrationsForTests();
  surface.props = null;
  vi.clearAllMocks();
});

it("retains a picker promotion until the surface opens, then previews without writing", () => {
  const view = renderUi(<KnowledgeSurface binding={null} threadTitle="" visible={false} />);
  act(() => requestRagdocPromotion("note-123"));
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: "kbRagdocPromote" }));
  view.rerender(<KnowledgeSurface binding={null} threadTitle="" visible />);
  expect(wsSend).toHaveBeenCalledWith({ type: "kbRagdocPromote", id: "note-123" });
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({ write: true }));
  act(() => window.dispatchEvent(new CustomEvent("kb-page-preview", {
    detail: { id: "note-123", slug: "note.md", title: "Ma note", preview: "Texte à vérifier" },
  })));
  expect(screen.getByText("Texte à vérifier")).toBeTruthy();
  expect(consumeRagdocPromotion()).toBeNull();
});

it("consumes an intention made before the knowledge surface mounts", () => {
  requestRagdocPromotion("before-mount");
  renderUi(<KnowledgeSurface binding={null} threadTitle="" visible />);
  expect(wsSend).toHaveBeenCalledWith({ type: "kbRagdocPromote", id: "before-mount" });
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({ write: true }));
});

it("Ragdoc configuré : la surface demande les articles du corpus", () => {
  renderUi(<KnowledgeSurface binding={null} threadTitle="" visible />);
  expect(wsSend).toHaveBeenCalledWith({ type: "articleList", limit: 100, offset: 0 });
  expect(surface.props?.ragdoc).toBe(true);
  expect(surface.props?.gbrain).toBeTruthy();
});

it("Ragdoc non configuré : aucun message Ragdoc, sa section disparaît, la base locale reste", () => {
  resetIntegrationsForTests();
  requestRagdocPromotion("note-1");
  renderUi(<KnowledgeSurface binding={null} threadTitle="" visible />);
  const types = vi.mocked(wsSend).mock.calls.map(([message]) => (message as { type: string }).type);
  expect(types).not.toContain("articleList");
  expect(types).not.toContain("kbRagdocPromote");
  expect(types).not.toContain("ragdocSearch");
  // la surface reçoit « pas de Ragdoc » : ni corpus, ni recherche, ni envoi
  expect(surface.props?.ragdoc).toBe(false);
  expect(surface.props?.ragdocWorkspace).toBeFalsy();
  expect(surface.props?.gbrain).toBeUndefined();
  expect(surface.props?.onPromote).toBeUndefined();
  expect(surface.props?.onAddArticle).toBeUndefined();
  expect(surface.props?.corpusStatus).toBeNull();
  // …mais la base locale se charge toujours
  expect(surface.props?.onAddFiles).toBeTypeOf("function");
  expect(surface.props?.onAddNote).toBeTypeOf("function");
  // une liste d'articles arrivée en retard ne ressuscite pas le corpus
  act(() => window.dispatchEvent(new CustomEvent("article-listed", { detail: { articles: [{ slug: "a" }], nextOffset: 100 } })));
  expect(wsSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: "articleList" }));
});
