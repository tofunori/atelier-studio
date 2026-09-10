import { describe, expect, it } from "vitest";
import { makeProviderInfo } from "../../test/fixtures";
import {
  assistantUiEffortLabel,
  assistantUiEffortLevels,
  chatModelOptionId,
  chatModelStorageKey,
  parseChatModelOptionId,
  persistChatModelSelection,
  resolveChatModelSelection,
} from "./assistantUiModelSelection";

const defaults = { defaultProvider: "codex", defaultModel: { codex: "model-a" }, defaultEffort: { codex: "low" }, defaultPermissionMode: "acceptEdits" };
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("assistant-ui model preference bridge", () => {
  it("keeps the real Auto value when a CLI model changes", () => {
    const provider = makeProviderInfo({
      efforts: ["high", "low"],
      models: ["model-a", "model-b"],
    });
    const levels = assistantUiEffortLevels(provider, "model-b");

    expect(levels).toEqual(["", "low", "high"]);
    expect(levels.includes("")).toBe(true);
    expect(assistantUiEffortLabel("")).toBe("Auto");
  });

  it("uses model-declared CLI levels without inventing a level for an unannounced model", () => {
    const provider = makeProviderInfo({
      id: "kimi",
      efforts: [],
      models: ["thinking", "plain"],
      modelReasoning: { thinking: { supported_efforts: ["on", "off"] } },
    });

    expect(assistantUiEffortLevels(provider, "thinking")).toEqual(["", "off", "on"]);
    expect(assistantUiEffortLevels(provider, "plain")).toEqual([""]);
  });

  it("filters API effort ids through the shared contract and honors mandatory none", () => {
    const provider = makeProviderInfo({
      id: "openai",
      kind: "api",
      efforts: [],
      modelReasoning: {
        model: { supported_efforts: ["high", "bogus", "none"], mandatory: true },
      },
    });

    expect(assistantUiEffortLevels(provider, "model")).toEqual(["", "high"]);
  });

  it("keeps selections isolated when switching conversations", () => {
    const storage = memory();
    const first = { provider: "codex", model: "model-b", effort: "high", permissionMode: "plan", fastMode: true };
    persistChatModelSelection(storage, chatModelStorageKey("one"), first);
    expect(resolveChatModelSelection({ storage, defaults, threadId: "one" })).toEqual(first);
    expect(resolveChatModelSelection({ storage, defaults, threadId: "two" }).model).toBe("model-a");
    expect(resolveChatModelSelection({ storage, defaults, threadId: "two" }).fastMode).toBe(false);
  });
  it("migrates a project preference but gives a persisted thread precedence", () => {
    const storage = memory();
    storage.setItem(chatModelStorageKey(null, "/project")!, JSON.stringify({ provider: "codex", model: "old-project", effort: "max" }));
    const options = { storage, defaults, projectRoot: "/project", threadId: "one" };
    expect(resolveChatModelSelection(options).model).toBe("old-project");
    persistChatModelSelection(storage, chatModelStorageKey("one"), { provider: "codex", model: "own", effort: "low", permissionMode: "plan", fastMode: false });
    expect(resolveChatModelSelection(options).model).toBe("own");
  });
  it("preserves another provider's saved model and never transfers Codex fast mode", () => {
    const storage = memory();
    const key = chatModelStorageKey("one");
    persistChatModelSelection(storage, key, { provider: "codex", model: "a", effort: "max", permissionMode: "plan", fastMode: true });
    persistChatModelSelection(storage, key, { provider: "claude", model: "anthropic/x:y", effort: "low", permissionMode: "plan", fastMode: true });
    expect(resolveChatModelSelection({ storage, defaults, threadId: "one" }).fastMode).toBe(false);
    expect(resolveChatModelSelection({ storage, defaults, threadId: "one", threadProvider: "codex" }).model).toBe("a");
    expect(parseChatModelOptionId(chatModelOptionId("claude", "anthropic/x:y"))).toEqual({ provider: "claude", model: "anthropic/x:y" });
  });
});
