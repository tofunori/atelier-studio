import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { composerDraftKey, loadChatDrafts, serializeChatDrafts, useChatDraftStore, type ChatDraft } from "./chatDraftStore";

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
        permissionMode: "default", fastMode: false, createdAt: 12,
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

it("keeps a native app mention through queue persistence", () => {
  const raw = JSON.stringify({ version: 1, drafts: { "thread:app": {
    prompt: "", attachments: [], queuedTurns: [{ id: "q", prompt: "@app-drive", provider: "codex", attachments: [],
      pluginSkills: [{ type: "mention", name: "Drive", path: "app://connector_drive" }] }], updatedAt: 1,
  } } });
  const loaded = loadChatDrafts({ getItem: () => raw });
  const restored = loadChatDrafts({ getItem: () => serializeChatDrafts(loaded) });
  expect(restored["thread:app"].queuedTurns[0].pluginSkills).toEqual([{ type: "mention", name: "Drive", path: "app://connector_drive" }]);
});

describe("useChatDraftStore — texte hors de l'état React", () => {
  const STORAGE = "atelier-studio.chat-drafts:v1";
  const queued = (id: string, prompt: string) => ({
    id, prompt, provider: "codex", model: "gpt", effort: "high", permissionMode: "default", fastMode: false,
    attachments: [{ name: "a.png", lines: null, text: "img" }], webSearch: false, additionalDirectories: [],
    pluginSkills: [], autoReview: null, createdAt: 1,
  });

  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("une frappe ne change ni drafts ni draft, mais notifie la source et persiste", () => {
    const { result } = renderHook(() => useChatDraftStore("thread:t1"));
    const before = result.current;
    const listener = vi.fn();
    const unsubscribe = result.current.promptSource.subscribe(listener);
    act(() => { result.current.promptSource.set("bonjour"); });
    expect(result.current.drafts).toBe(before.drafts);
    expect(result.current.draft).toBe(before.draft);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(result.current.promptSource.get()).toBe("bonjour");
    expect(result.current.getPrompt()).toBe("bonjour");
    act(() => { result.current.setPrompt((prev) => `${prev} !`); });
    expect(result.current.getPrompt("thread:t1")).toBe("bonjour !");
    act(() => { vi.advanceTimersByTime(400); });
    expect(JSON.parse(localStorage.getItem(STORAGE) ?? "{}").drafts["thread:t1"].prompt).toBe("bonjour !");
    unsubscribe();
  });

  it("recharge le texte persisté et le restaure depuis la file", () => {
    localStorage.setItem(STORAGE, JSON.stringify({ version: 1, drafts: {
      "thread:t1": { prompt: "gardé", attachments: [], queuedTurns: [queued("q1", "en file")], followUpMode: "queue", updatedAt: 1 },
    } }));
    const { result } = renderHook(() => useChatDraftStore("thread:t1"));
    expect(result.current.getPrompt()).toBe("gardé");
    expect(result.current.draft.prompt).toBe("");
    let restored: ReturnType<typeof result.current.restoreQueuedTurn> = null;
    act(() => { restored = result.current.restoreQueuedTurn("thread:t1", "q1"); });
    expect(restored).toMatchObject({ id: "q1" });
    expect(result.current.getPrompt()).toBe("en file");
    expect(result.current.draft.queuedTurns).toHaveLength(0);
    expect(result.current.draft.attachments).toHaveLength(1);
  });
});
