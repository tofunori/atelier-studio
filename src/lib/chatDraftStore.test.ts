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
        webSearch: true,
        additionalDirectories: ["/data/reference"],
        pluginSkills: [{ name: "nature-figure", path: "/skills/nature-figure/SKILL.md" }],
        autoReview: { enabled: true, provider: "codex", model: "gpt", effort: "high", trigger: "turn" },
        attachments: [{ name: "main.tex", lines: "12", text: "fichier", path: "/repo/main.tex" }],
      }],
      followUpMode: "steer",
      updatedAt: 10,
    };
    const raw = serializeChatDrafts({ "thread:t1": draft });
    expect(raw).not.toContain("base64");
    const loaded = loadChatDrafts({ getItem: () => raw });
    expect(loaded["thread:t1"].prompt).toBe("suite de l’analyse");
    expect(loaded["thread:t1"].attachments[0].path).toBe("/tmp/plot.png");
    expect(loaded["thread:t1"].queuedTurns[0].prompt).toBe("puis compare");
    expect(loaded["thread:t1"].followUpMode).toBe("steer");
    expect(loaded["thread:t1"].queuedTurns[0]).toMatchObject({
      webSearch: true,
      additionalDirectories: ["/data/reference"],
      pluginSkills: [{ name: "nature-figure", path: "/skills/nature-figure/SKILL.md" }],
      autoReview: { enabled: true, provider: "codex", model: "gpt", effort: "high", trigger: "turn" },
    });
  });

  it("recrée les aperçus AppSnap au chargement au lieu de persister une URL WebView", () => {
    const draft: ChatDraft = {
      prompt: "",
      attachments: [{
        name: "appsnap.png",
        lines: null,
        text: "capture",
        kind: "appsnap",
        path: "/private/appsnap.png",
        imageUrl: "blob:http://tauri.localhost/preview",
      }],
      queuedTurns: [],
      followUpMode: "queue",
      updatedAt: 1,
    };
    const raw = serializeChatDrafts({ "thread:appsnap": draft });
    expect(raw).not.toContain("blob:");
    expect(loadChatDrafts({ getItem: () => raw })["thread:appsnap"].attachments[0]).toMatchObject({
      kind: "appsnap",
      path: "/private/appsnap.png",
    });
    expect(loadChatDrafts({ getItem: () => raw })["thread:appsnap"].attachments[0].imageUrl).toBeUndefined();
  });

  it("migre une ancienne relance avec des options sûres et immuables", () => {
    const raw = JSON.stringify({
      version: 1,
      drafts: {
        "thread:t1": {
          prompt: "",
          attachments: [],
          queuedTurns: [{
            id: "legacy", prompt: "continue", provider: "claude", model: "sonnet",
            effort: "medium", permissionMode: "default", attachments: [], createdAt: 1,
          }],
          updatedAt: 1,
        },
      },
    });
    const turn = loadChatDrafts({ getItem: () => raw })["thread:t1"].queuedTurns[0];
    expect(turn.webSearch).toBe(false);
    expect(turn.additionalDirectories).toEqual([]);
    expect(turn.pluginSkills).toEqual([]);
    expect(turn.autoReview).toBeNull();
    expect(loadChatDrafts({ getItem: () => raw })["thread:t1"].followUpMode).toBe("queue");
  });

  it("ignore un schéma inconnu au lieu d’écraser le composer", () => {
    const loaded = loadChatDrafts({ getItem: () => JSON.stringify({ version: 99, drafts: { x: {} } }) });
    expect(loaded).toEqual({});
  });

  it("persiste Steer même quand le brouillon est vide; Queue reste le défaut implicite", () => {
    const steerDraft: ChatDraft = {
      prompt: "", attachments: [], queuedTurns: [], followUpMode: "steer", updatedAt: 1,
    };
    const queueDraft: ChatDraft = { ...steerDraft, followUpMode: "queue" };
    expect(serializeChatDrafts({ "thread:steer": steerDraft })).toContain("followUpMode");
    expect(serializeChatDrafts({ "thread:queue": queueDraft })).not.toContain("thread:queue");
  });
});
