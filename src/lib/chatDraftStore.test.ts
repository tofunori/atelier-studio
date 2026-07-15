import { describe, expect, it } from "vitest";
import { composerDraftKey, loadChatDrafts, serializeChatDrafts, type ChatDraft } from "./chatDraftStore";

describe("chatDraftStore", () => {
  it("isole les brouillons par conversation et les nouveaux chats par projet", () => {
    expect(composerDraftKey("t-1", "/a")).toBe("thread:t-1");
    expect(composerDraftKey(null, "/a")).toBe("new:/a");
    expect(composerDraftKey(null, null)).toBe("new:no-project");
  });

  it("sérialise prompt, contexte et file, sans data URL volumineuse", () => {
    const draft: ChatDraft = {
      prompt: "suite de l’analyse",
      attachments: [{ name: "plot.png", lines: null, text: "image", path: "/tmp/plot.png", imageUrl: "data:image/png;base64,AAAA" }],
      queuedTurns: [{
        id: "q1", prompt: "puis compare", provider: "codex", model: "gpt", effort: "high",
        permissionMode: "default", createdAt: 12,
        attachments: [{ name: "main.tex", lines: "12", text: "fichier", path: "/repo/main.tex" }],
      }],
      updatedAt: 10,
    };
    const raw = serializeChatDrafts({ "thread:t1": draft });
    expect(raw).not.toContain("base64");
    const loaded = loadChatDrafts({ getItem: () => raw });
    expect(loaded["thread:t1"].prompt).toBe("suite de l’analyse");
    expect(loaded["thread:t1"].attachments[0].path).toBe("/tmp/plot.png");
    expect(loaded["thread:t1"].queuedTurns[0].prompt).toBe("puis compare");
  });

  it("ignore un schéma inconnu au lieu d’écraser le composer", () => {
    const loaded = loadChatDrafts({ getItem: () => JSON.stringify({ version: 99, drafts: { x: {} } }) });
    expect(loaded).toEqual({});
  });
});
