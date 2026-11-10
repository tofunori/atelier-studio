// Écran vide (aucun projet, aucun fil) : le titre et le champ se tiennent au
// centre. La classe `is-vide` est posée par Chat.tsx (jamais par :has() en
// CSS) et trois gestes réels sont rappelés sous le champ.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

import Chat from "../Chat";
import type { ResearchHomeBundle } from "../ResearchHome";
import { renderUi, resetTestState } from "../../test/render";
import { t } from "../../lib/i18n";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function chatProps(over: Partial<Parameters<typeof Chat>[0]> = {}): Parameters<typeof Chat>[0] {
  return {
    events: [], workingSince: null, commands: [], files: [], recentFiles: [],
    zoteroItems: [], injectText: null, onInjected: vi.fn(), attachments: [],
    onRemoveAttachment: vi.fn(), onQuote: vi.fn(), threadId: null,
    onPasteImage: vi.fn(), onPasteText: vi.fn(), onStop: vi.fn(),
    layout: "chat", onToggleExpand: vi.fn(), usage: null, onRevert: vi.fn(),
    onFork: vi.fn(), onEditSend: vi.fn(), onNewChat: vi.fn(), onOpenProject: vi.fn(),
    highlights: [],
    defaults: { defaultProvider: "claude", defaultModel: {}, defaultEffort: {}, defaultPermissionMode: "bypassPermissions" },
    pins: [], onStylePin: vi.fn(), onTogglePin: vi.fn(), disabled: false, onSubmit: vi.fn(),
    ...over,
  };
}

const noop = () => {};
const actions: ResearchHomeBundle["actions"] = {
  onNewChat: noop, onOpenProject: noop, onResume: noop, onOpenArtefact: noop,
  onOpenGallery: noop, onOpenPalette: noop, onResumeSession: noop,
};
const sansProjet: ResearchHomeBundle = { model: { state: "no-project" }, actions };

beforeEach(resetTestState);
afterEach(cleanup);

describe("écran vide du chat", () => {
  it("sans projet ni fil : classe is-vide et trois rappels de raccourcis", () => {
    renderUi(<Chat {...chatProps({ home: sansProjet })} />);
    expect(document.querySelector(".chat-primary")).toHaveClass("is-vide");
    const aide = document.querySelector(".chat-vide-aide");
    expect(aide).not.toBeNull();
    expect([...aide!.querySelectorAll("kbd.ui-kbd")].map((k) => k.textContent)).toEqual(["⌘K", "⇧⌘P", "⌘V"]);
    expect(aide).toHaveTextContent(t("home.hint.search"));
    expect(aide).toHaveTextContent(t("home.hint.projects"));
    expect(aide).toHaveTextContent(t("home.hint.paste"));
    // les rappels suivent le champ : ils ne s'intercalent pas avant lui
    const form = document.querySelector("form.composer")!;
    expect(form.compareDocumentPosition(aide!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("dès qu'un fil est ouvert, l'écran reprend sa mise en page ordinaire", () => {
    renderUi(<Chat {...chatProps({ home: null, threadId: "thread-A" })} />);
    expect(document.querySelector(".chat-primary")).not.toHaveClass("is-vide");
    expect(document.querySelector(".chat-vide-aide")).toBeNull();
  });

  it("le centrage passe par la classe, sans :has()", () => {
    const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
    const rules = css.split("\n").filter((line) => line.includes(".is-vide"));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).not.toContain(":has(");
  });
});
