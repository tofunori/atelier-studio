// Trace du contexte vivant sous la bulle user : « chapitre1.tex · lignes 23-25 ».
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { renderUi } from "../../test/render";
import { UserTurn } from "./turns";
import { setLanguage, t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";

afterEach(cleanup);
beforeEach(() => setLanguage("fr"));

function renderTurn(event: Extract<AgentEvent, { kind: "user" }>, editingText: string | null = null) {
  return renderUi(<UserTurn event={event} index={0} timeFormat="24h" pinned={false}
    renderBubbleText={(value) => value} editingText={editingText} onEditingChange={vi.fn()}
    onEditSend={vi.fn()} onRevert={vi.fn()} onTogglePin={vi.fn()} onOpenPaste={vi.fn()} />);
}

it("montre sous la bulle ce qui est parti avec le message", () => {
  renderTurn({ kind: "user", text: "Ce passage est-il cohérent ?", ts: 1,
    liveContext: { path: "/p/chapitre1.tex", name: "chapitre1.tex", lineFrom: 23, lineTo: 25, comments: 2 } });
  const trace = document.querySelector(".user-live-context")!;
  expect(trace).toHaveTextContent("chapitre1.tex · lignes 23-25");
  expect(trace.getAttribute("title")).toBe("/p/chapitre1.tex");
  expect(trace.getAttribute("aria-label")).toBe(t("live-context.trace", { name: "chapitre1.tex", where: "lignes 23-25" }));
  expect(trace.querySelector("svg.user-live-context-glyph")).toBeTruthy();
  // la trace suit la bulle et précède l'heure
  const bubble = document.querySelector(".user-bubble-shell")!;
  expect(bubble.compareDocumentPosition(trace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("page de PDF ; rien sans contexte ; rien pendant l'édition", () => {
  const { unmount } = renderTurn({ kind: "user", text: "q", liveContext: { path: "/a.pdf", name: "a.pdf", page: 7 } });
  expect(document.querySelector(".user-live-context")).toHaveTextContent("a.pdf · page 7");
  unmount();
  const plain = renderTurn({ kind: "user", text: "q" });
  expect(document.querySelector(".user-live-context")).toBeNull();
  plain.unmount();
  renderTurn({ kind: "user", text: "q", liveContext: { path: "/a.pdf", name: "a.pdf", page: 7 } }, "q");
  expect(document.querySelector(".user-live-context")).toBeNull();
});
