import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { renderUi } from "../test/render";
import { consumeRagdocPromotion, requestRagdocPromotion } from "../lib/ragdocPromotion";
import { wsSend } from "../lib/wsBus";
import KnowledgeSurface from "./KnowledgeSurface";

vi.mock("../lib/wsBus", () => ({ wsSend: vi.fn(() => true), wsReady: () => true }));
vi.mock("./chat/KbSurface", () => ({ default: () => null }));
vi.mock("./chat/kbActions", () => ({ useKbActions: () => ({ error: null }) }));

afterEach(() => {
  cleanup();
  consumeRagdocPromotion();
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
