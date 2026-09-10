import type { ProviderInfo } from "../providers";
import { effortOptionsFor, sortEffortLevels } from "../effortOrder";

/** API effort ids accepted by the existing Chat composer contract. */
export const API_REASONING_LEVELS = [
  "",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

/**
 * Resolve the effort ids offered by the official assistant-ui picker.
 *
 * This deliberately mirrors Chat.tsx's levelsFor policy: catalogue values are
 * authoritative for CLI providers, while API providers use only the shared
 * API reasoning contract. The empty id is the real Auto value; it is included
 * only where the provider contract allows it, never as a fabricated budget or
 * label.
 */
export function assistantUiEffortLevels(
  provider: ProviderInfo | undefined,
  modelId: string,
): string[] {
  if (!provider) return [];

  const meta = provider.modelReasoning?.[modelId];
  if (provider.kind !== "api") {
    if (Array.isArray(meta?.supported_efforts)) {
      return sortEffortLevels(["", ...meta.supported_efforts]);
    }
    return effortOptionsFor(provider.id, provider.efforts ?? []);
  }

  const supported = Array.isArray(meta?.supported_efforts) && meta.supported_efforts.length
    ? meta.supported_efforts.filter((level) =>
      (API_REASONING_LEVELS as readonly string[]).includes(level),
    )
    : API_REASONING_LEVELS.slice(2);
  return sortEffortLevels([
    "",
    ...(meta?.mandatory ? [] : ["none"]),
    ...supported.filter((level) => level !== "none"),
  ]);
}

/** Keep the picker label meaningful when the wire id is the Auto sentinel. */
export function assistantUiEffortLabel(level: string): string {
  return level === "" ? "Auto" : level;
}

export type ChatModelSelection = {
  provider: string;
  model: string;
  effort: string;
  permissionMode: string;
  fastMode: boolean;
};

export type ChatModelDefaults = {
  defaultProvider: string;
  defaultModel: Record<string, string>;
  defaultEffort: Record<string, string>;
  defaultPermissionMode: string;
  modelEfforts?: Record<string, string>;
};

export function isChatModelSelection(value: unknown): value is ChatModelSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["provider", "model", "effort", "permissionMode"].every(key => typeof item[key] === "string")
    && typeof item.fastMode === "boolean";
}

type StoredSelections = {
  activeProvider: string;
  byProvider: Record<string, Partial<Omit<ChatModelSelection, "provider">>>;
};

export function chatModelStorageKey(threadId?: string | null, projectRoot?: string | null) {
  return threadId ? `atelier-studio.modelSel.thread:${threadId}`
    : projectRoot ? `atelier-studio.modelSel:${projectRoot}` : null;
}

function parseSelections(raw: string | null): StoredSelections | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    if (value.byProvider && typeof value.byProvider === "object") return value;
    if (typeof value.provider === "string") {
      return { activeProvider: value.provider, byProvider: { [value.provider]: value } };
    }
  } catch { /* A damaged preference must not prevent opening a conversation. */ }
  return null;
}

export function resolveChatModelSelection(options: {
  storage: Pick<Storage, "getItem">;
  threadId?: string | null;
  projectRoot?: string | null;
  threadProvider?: string;
  defaults: ChatModelDefaults;
  providers?: readonly ProviderInfo[];
}): ChatModelSelection {
  const { storage, threadId, projectRoot, threadProvider, defaults, providers = [] } = options;
  const key = chatModelStorageKey(threadId, projectRoot);
  const read = (key: string | null) => {
    try { return key ? parseSelections(storage.getItem(key)) : null; } catch { return null; }
  };
  const saved = read(key) ?? (threadId ? read(chatModelStorageKey(null, projectRoot)) : null);
  const provider = threadProvider || saved?.activeProvider || defaults.defaultProvider;
  const selected = saved?.byProvider[provider];
  const info = providers.find(item => item.id === provider);
  const model = selected?.model || defaults.defaultModel[provider] || info?.defaultModel || "";
  return {
    provider, model,
    effort: selected?.effort ?? defaults.modelEfforts?.[`${provider}:${model}`]
      ?? info?.modelReasoning?.[model]?.default_effort ?? defaults.defaultEffort[provider] ?? "medium",
    permissionMode: selected?.permissionMode || defaults.defaultPermissionMode,
    fastMode: provider === "codex" && selected?.fastMode === true,
  };
}

/** Preserve the previous per-provider choices when the official picker changes. */
export function persistChatModelSelection(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string | null,
  selection: ChatModelSelection,
) {
  if (!key) return;
  try {
    const saved = parseSelections(storage.getItem(key));
    const { provider, ...value } = selection;
    storage.setItem(key, JSON.stringify({
      activeProvider: provider,
      byProvider: { ...saved?.byProvider, [provider]: value },
    } satisfies StoredSelections));
  } catch { /* The current selection remains usable if preferences are read-only. */ }
}

// A model name can itself contain a slash or colon. JSON keeps the provider
// identity unambiguous without imposing a naming convention on any backend.
export const chatModelOptionId = (provider: string, model: string) => JSON.stringify([provider, model]);
export function parseChatModelOptionId(id: string): { provider: string; model: string } | null {
  try {
    const value: unknown = JSON.parse(id);
    if (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === "string")) {
      return { provider: value[0], model: value[1] };
    }
  } catch { /* Ignore values that did not come from our model catalog. */ }
  return null;
}
