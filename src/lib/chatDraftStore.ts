import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "atelier-studio.chat-drafts:v1";
const SCHEMA_VERSION = 1;
const WRITE_DELAY_MS = 300;

export type DraftAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  path?: string;
  kind?: "file" | "folder" | "zotero" | "quote" | "paste";
  preview?: { title: string; rows: { label: string; value: string }[] };
};

export type QueuedTurn = {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  effort: string;
  permissionMode: string;
  attachments: DraftAttachment[];
  /** Options résolues au moment de la mise en file. Elles ne doivent jamais
   * être recalculées depuis le composer courant lors du dispatch. */
  webSearch: boolean;
  additionalDirectories: string[];
  pluginSkills: { name: string; path: string }[];
  autoReview: {
    enabled: boolean;
    provider: string;
    model: string;
    effort: string;
    trigger: string;
    autofix?: boolean;
  } | null;
  createdAt: number;
};

export type FollowUpMode = "queue" | "steer";

export type ChatDraft = {
  prompt: string;
  attachments: DraftAttachment[];
  queuedTurns: QueuedTurn[];
  /** Action utilisée par Enter pendant un tour actif. Codex met les relances
   * en file par défaut et mémorise le choix explicite Queue/Steer. */
  followUpMode: FollowUpMode;
  updatedAt: number;
};

type PersistedDrafts = {
  version: typeof SCHEMA_VERSION;
  drafts: Record<string, ChatDraft>;
};

const EMPTY_DRAFT: ChatDraft = {
  prompt: "",
  attachments: [],
  queuedTurns: [],
  followUpMode: "queue",
  updatedAt: 0,
};

function validAttachment(value: unknown): value is DraftAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DraftAttachment>;
  return typeof item.name === "string" && typeof item.text === "string";
}

function validQueuedTurn(value: unknown): value is QueuedTurn {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QueuedTurn>;
  return typeof item.id === "string" && typeof item.prompt === "string" &&
    typeof item.provider === "string" && Array.isArray(item.attachments) &&
    item.attachments.every(validAttachment);
}

function normalizeQueuedTurn(value: unknown): QueuedTurn | null {
  if (!validQueuedTurn(value)) return null;
  const item = value as Partial<QueuedTurn>;
  const autoReview = item.autoReview && typeof item.autoReview === "object"
    ? {
        enabled: Boolean(item.autoReview.enabled),
        provider: typeof item.autoReview.provider === "string" ? item.autoReview.provider : "",
        model: typeof item.autoReview.model === "string" ? item.autoReview.model : "",
        effort: typeof item.autoReview.effort === "string" ? item.autoReview.effort : "",
        trigger: typeof item.autoReview.trigger === "string" ? item.autoReview.trigger : "turn",
        ...(typeof item.autoReview.autofix === "boolean" ? { autofix: item.autoReview.autofix } : {}),
      }
    : null;
  return {
    ...item,
    id: item.id!,
    prompt: item.prompt!,
    provider: item.provider!,
    model: typeof item.model === "string" ? item.model : "",
    effort: typeof item.effort === "string" ? item.effort : "",
    permissionMode: typeof item.permissionMode === "string" ? item.permissionMode : "",
    attachments: item.attachments!.filter(validAttachment),
    webSearch: item.webSearch === true,
    additionalDirectories: Array.isArray(item.additionalDirectories)
      ? item.additionalDirectories.filter((entry): entry is string => typeof entry === "string")
      : [],
    pluginSkills: Array.isArray(item.pluginSkills)
      ? item.pluginSkills.filter((entry): entry is { name: string; path: string } =>
          Boolean(entry) && typeof entry === "object" &&
          typeof (entry as { name?: unknown }).name === "string" &&
          typeof (entry as { path?: unknown }).path === "string")
      : [],
    autoReview,
    createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now(),
  };
}

function normalizeDraft(value: unknown): ChatDraft {
  if (!value || typeof value !== "object") return EMPTY_DRAFT;
  const draft = value as Partial<ChatDraft>;
  return {
    prompt: typeof draft.prompt === "string" ? draft.prompt : "",
    attachments: Array.isArray(draft.attachments) ? draft.attachments.filter(validAttachment) : [],
    queuedTurns: Array.isArray(draft.queuedTurns)
      ? draft.queuedTurns.map(normalizeQueuedTurn).filter((turn): turn is QueuedTurn => turn !== null)
      : [],
    followUpMode: draft.followUpMode === "steer" ? "steer" : "queue",
    updatedAt: Number.isFinite(draft.updatedAt) ? Number(draft.updatedAt) : 0,
  };
}

export function composerDraftKey(threadId: string | null, projectRoot: string | null): string {
  if (threadId) return `thread:${threadId}`;
  return `new:${projectRoot || "no-project"}`;
}

export function loadChatDrafts(storage: Pick<Storage, "getItem"> = localStorage): Record<string, ChatDraft> {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Partial<PersistedDrafts> | null;
    if (!parsed || parsed.version !== SCHEMA_VERSION || !parsed.drafts || typeof parsed.drafts !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed.drafts).map(([key, value]) => [key, normalizeDraft(value)]),
    );
  } catch {
    return {};
  }
}

function persistableAttachment(attachment: DraftAttachment): DraftAttachment {
  // L'image est déjà sauvegardée sur disque par le sidecar. Une data URL peut
  // dépasser le quota localStorage : garder le chemin et retirer seulement la
  // prévisualisation éphémère.
  if (!attachment.imageUrl?.startsWith("data:")) return attachment;
  const { imageUrl: _imageUrl, ...rest } = attachment;
  return rest;
}

export function serializeChatDrafts(drafts: Record<string, ChatDraft>): string {
  const persisted: Record<string, ChatDraft> = {};
  for (const [key, draft] of Object.entries(drafts)) {
    if (!draft.prompt && !draft.attachments.length && !draft.queuedTurns.length && draft.followUpMode === "queue") continue;
    persisted[key] = {
      ...draft,
      attachments: draft.attachments.map(persistableAttachment),
      queuedTurns: draft.queuedTurns.map((turn) => ({
        ...turn,
        attachments: turn.attachments.map(persistableAttachment),
      })),
    };
  }
  return JSON.stringify({ version: SCHEMA_VERSION, drafts: persisted } satisfies PersistedDrafts);
}

export function useChatDraftStore(activeKey: string) {
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>(() => loadChatDrafts());
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  const updateDraft = useCallback((key: string, update: (draft: ChatDraft) => ChatDraft) => {
    setDrafts((current) => {
      const next = update(current[key] ?? EMPTY_DRAFT);
      return { ...current, [key]: { ...next, updatedAt: Date.now() } };
    });
  }, []);

  const setPrompt = useCallback<React.Dispatch<React.SetStateAction<string>>>((action) => {
    updateDraft(activeKeyRef.current, (draft) => ({
      ...draft,
      prompt: typeof action === "function" ? action(draft.prompt) : action,
    }));
  }, [updateDraft]);

  const setAttachments = useCallback<React.Dispatch<React.SetStateAction<DraftAttachment[]>>>((action) => {
    updateDraft(activeKeyRef.current, (draft) => ({
      ...draft,
      attachments: typeof action === "function" ? action(draft.attachments) : action,
    }));
  }, [updateDraft]);

  const setFollowUpMode = useCallback((mode: FollowUpMode) => {
    updateDraft(activeKeyRef.current, (draft) => ({ ...draft, followUpMode: mode }));
  }, [updateDraft]);

  const enqueueTurn = useCallback((key: string, turn: QueuedTurn) => {
    updateDraft(key, (draft) => ({ ...draft, queuedTurns: [...draft.queuedTurns, turn] }));
  }, [updateDraft]);

  const removeQueuedTurn = useCallback((key: string, id: string) => {
    updateDraft(key, (draft) => ({
      ...draft,
      queuedTurns: draft.queuedTurns.filter((turn) => turn.id !== id),
    }));
  }, [updateDraft]);

  const restoreQueuedTurn = useCallback((key: string, id: string) => {
    let restored: QueuedTurn | null = null;
    updateDraft(key, (draft) => {
      restored = draft.queuedTurns.find((turn) => turn.id === id) ?? null;
      if (!restored) return draft;
      return {
        ...draft,
        prompt: restored.prompt,
        attachments: restored.attachments,
        queuedTurns: draft.queuedTurns.filter((turn) => turn.id !== id),
      };
    });
    return restored;
  }, [updateDraft]);

  const flush = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, serializeChatDrafts(draftsRef.current)); } catch { /* quota/webview restreinte */ }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(flush, WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [drafts, flush]);

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  const draft = useMemo(() => drafts[activeKey] ?? EMPTY_DRAFT, [activeKey, drafts]);
  return {
    draft,
    drafts,
    setPrompt,
    setAttachments,
    setFollowUpMode,
    updateDraft,
    enqueueTurn,
    removeQueuedTurn,
    restoreQueuedTurn,
    flush,
  };
}
