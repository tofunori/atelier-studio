import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "atelier-studio.chat-drafts:v1";
const SCHEMA_VERSION = 1;
const WRITE_DELAY_MS = 300;

export type DraftAttachment = {
  name: string;
  lines: string | null;
  text: string;
  imageUrl?: string;
  pdfAnnotation?: { origin: string; rel: string; id: string };
  path?: string;
  kind?: "file" | "folder" | "zotero" | "quote" | "paste" | "appsnap";
  /** Figure annotée depuis la galerie : badges numérotés de l'image. */
  notes?: { n: number; text: string }[];
  preview?: { title: string; rows: { label: string; value: string }[] };
};

export type QueuedTurn = {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  effort: string;
  permissionMode: string;
  /** Niveau de service Codex résolu à la mise en file (Fast = priority). */
  fastMode: boolean;
  attachments: DraftAttachment[];
  /** Options résolues au moment de la mise en file. Elles ne doivent jamais
   * être recalculées depuis le composer courant lors du dispatch. */
  webSearch: boolean;
  additionalDirectories: string[];
  pluginSkills: { name: string; path: string; type?: "skill" | "mention" }[];
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

function normalizeAttachment(value: unknown): DraftAttachment | null {
  if (!validAttachment(value)) return null;
  if (value.kind !== "appsnap" || !value.imageUrl) return value;
  // Les URL d'aperçu AppSnap sont des object URLs propres au WebView courant.
  // Le chemin privé persiste; App.tsx recrée le Blob après un redémarrage.
  const { imageUrl: _imageUrl, ...persisted } = value;
  return persisted;
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
    fastMode: item.fastMode === true,
    attachments: item.attachments!
      .map(normalizeAttachment)
      .filter((attachment): attachment is DraftAttachment => attachment !== null),
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
    attachments: Array.isArray(draft.attachments)
      ? draft.attachments
          .map(normalizeAttachment)
          .filter((attachment): attachment is DraftAttachment => attachment !== null)
      : [],
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
  // Le PNG AppSnap est déjà sauvegardé dans le dossier privé de l'app. Son
  // object URL appartient au WebView courant et doit être recréée au chargement.
  // Les data URLs ordinaires restent aussi exclues pour préserver le quota.
  if (attachment.kind !== "appsnap" && !attachment.imageUrl?.startsWith("data:")) return attachment;
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

/** Texte du composer, hors de l'état React d'App : une frappe ne redessine
 * que le champ abonné (Chat, lecture PDF), plus toute l'application. */
export type PromptSource = {
  get(): string;
  set: React.Dispatch<React.SetStateAction<string>>;
  subscribe(listener: () => void): () => void;
};

type PromptStore = {
  get(key: string): string;
  set(key: string, value: string): void;
  entries(): [string, string][];
  subscribe(listener: () => void): () => void;
};

function createPromptStore(initial: Record<string, ChatDraft>): PromptStore {
  const prompts = new Map<string, string>();
  for (const [key, draft] of Object.entries(initial)) if (draft.prompt) prompts.set(key, draft.prompt);
  const listeners = new Set<() => void>();
  return {
    get: (key) => prompts.get(key) ?? "",
    set(key, value) {
      if ((prompts.get(key) ?? "") === value) return;
      if (value) prompts.set(key, value);
      else prompts.delete(key);
      for (const listener of listeners) listener();
    },
    entries: () => [...prompts.entries()],
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

function withoutPrompts(drafts: Record<string, ChatDraft>): Record<string, ChatDraft> {
  return Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key, draft.prompt ? { ...draft, prompt: "" } : draft]));
}

function withPrompts(drafts: Record<string, ChatDraft>, prompts: PromptStore): Record<string, ChatDraft> {
  const merged = { ...drafts };
  for (const [key, prompt] of prompts.entries()) merged[key] = { ...(merged[key] ?? EMPTY_DRAFT), prompt };
  return merged;
}

const NO_PROMPT_SUBSCRIBE = () => () => {};
const NO_PROMPT = () => "";

/** Lit le texte d'une source ; sans source, rend "" (composant non branché). */
export function usePromptText(source: PromptSource | null | undefined): string {
  return useSyncExternalStore(source?.subscribe ?? NO_PROMPT_SUBSCRIBE, source?.get ?? NO_PROMPT);
}

/** Texte d'un champ branché sur une source, sinon sur ses props contrôlées. */
export function usePromptBinding(
  source: PromptSource | null | undefined,
  value: string | undefined,
  onChange: ((value: string) => void) | undefined,
): [string, (value: string) => void] {
  const sourced = usePromptText(source);
  if (source) return [sourced, source.set];
  return [value ?? "", (next) => onChange?.(next)];
}

export function useChatDraftStore(activeKey: string) {
  // `drafts` (état React) ne porte jamais le texte : il vit dans `prompts`.
  const [loaded] = useState(() => loadChatDrafts());
  const [prompts] = useState(() => createPromptStore(loaded));
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>(() => withoutPrompts(loaded));
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  const updateDraft = useCallback((key: string, update: (draft: ChatDraft) => ChatDraft) => {
    setDrafts((current) => {
      const next = update(current[key] ?? EMPTY_DRAFT);
      return { ...current, [key]: { ...next, prompt: "", updatedAt: Date.now() } };
    });
  }, []);

  const setPrompt = useCallback<React.Dispatch<React.SetStateAction<string>>>((action) => {
    const key = activeKeyRef.current;
    prompts.set(key, typeof action === "function" ? action(prompts.get(key)) : action);
  }, [prompts]);

  const getPrompt = useCallback((key: string = activeKeyRef.current) => prompts.get(key), [prompts]);

  const promptSource = useMemo<PromptSource>(() => ({
    get: () => prompts.get(activeKey),
    set: setPrompt,
    subscribe: prompts.subscribe,
  }), [activeKey, prompts, setPrompt]);

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

  const reorderQueuedTurn = useCallback((key: string, draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    updateDraft(key, (draft) => {
      const fromIndex = draft.queuedTurns.findIndex((turn) => turn.id === draggedId);
      const targetIndex = draft.queuedTurns.findIndex((turn) => turn.id === targetId);
      if (fromIndex < 0 || targetIndex < 0) return draft;
      const queuedTurns = [...draft.queuedTurns];
      const [dragged] = queuedTurns.splice(fromIndex, 1);
      queuedTurns.splice(targetIndex, 0, dragged);
      return { ...draft, queuedTurns };
    });
  }, [updateDraft]);

  const restoreQueuedTurn = useCallback((key: string, id: string) => {
    // lu dans le ref, pas dans l'updater : React peut différer ce dernier
    const restored = draftsRef.current[key]?.queuedTurns.find((turn) => turn.id === id) ?? null;
    if (!restored) return null;
    prompts.set(key, restored.prompt);
    updateDraft(key, (draft) => ({
      ...draft,
      attachments: restored.attachments,
      queuedTurns: draft.queuedTurns.filter((turn) => turn.id !== id),
    }));
    return restored;
  }, [prompts, updateDraft]);

  const flush = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, serializeChatDrafts(withPrompts(draftsRef.current, prompts))); } catch { /* quota/webview restreinte */ }
  }, [prompts]);

  const flushTimer = useRef<number | null>(null);
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => { flushTimer.current = null; flush(); }, WRITE_DELAY_MS);
  }, [flush]);

  useEffect(() => { scheduleFlush(); }, [drafts, scheduleFlush]);
  useEffect(() => prompts.subscribe(scheduleFlush), [prompts, scheduleFlush]);

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
      flush();
    };
  }, [flush]);

  const draft = useMemo(() => drafts[activeKey] ?? EMPTY_DRAFT, [activeKey, drafts]);
  return {
    /** Pièces jointes, file et mode de relance ; `prompt` y reste vide. */
    draft,
    drafts,
    promptSource,
    getPrompt,
    setPrompt,
    setAttachments,
    setFollowUpMode,
    updateDraft,
    enqueueTurn,
    removeQueuedTurn,
    reorderQueuedTurn,
    restoreQueuedTurn,
    flush,
  };
}
