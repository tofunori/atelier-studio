"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  useAui,
  type DataMessagePartComponent,
  type DataMessagePartProps,
} from "@assistant-ui/react";
import type { AgentDisplay } from "./chat/AgentActivity";
import { WidgetFrame, type WidgetEvent } from "./chat/WidgetFrame";
import { localImagePreviewUrl, saveLocalImageToGallery } from "@/lib/localImage";
import { File } from "./assistant-ui/elements/file";
import { Image } from "./assistant-ui/elements/image";

import { AgentPlan } from "./assistant-ui/elements/agent-plan";
import { AgentStatus, type AgentState } from "./assistant-ui/elements/agent-status";
import { CodeDiff, type DiffLine } from "./assistant-ui/elements/code-diff";
import { TodoList, type TodoItem } from "./assistant-ui/elements/todo-list";
import { ToolError } from "./assistant-ui/elements/tool-error";
import { Button } from "./assistant-ui/primitives/button";

/**
 * Host actions remain outside assistant-ui's data registry.  The renderer
 * only supplies the stable path or agent identity; Chat/App owns navigation,
 * attachment persistence, and the child-thread panel.
 */
export type AssistantUiDataHost = {
  /** Current Atelier thread id used by WidgetFrame to fetch its sidecar HTML. */
  threadId?: string | null;
  onOpenAgent?: (agent: AgentDisplay) => void | Promise<void>;
  onAttachPath?: (path: string) => void | Promise<void>;
  onOpenFile?: (
    path: string,
    options?: { diff?: boolean; baseSha?: string | null },
  ) => void | Promise<void>;
};

type DataProps = DataMessagePartProps<unknown>;
type RecordData = Record<string, unknown>;

export const ATELIER_DATA_PART_NAMES = [
  "atelier-activity",
  "atelier-agent-message",
  "atelier-annotations",
  "atelier-attachments",
  "atelier-edit",
  "atelier-error",
  "atelier-goal",
  "atelier-image",
  "atelier-plan",
  "atelier-todos",
  "atelier-widget",
] as const;

export type AtelierDataPartName = (typeof ATELIER_DATA_PART_NAMES)[number];

/**
 * Assistant-ui has no generic upstream renderers for these provider-specific
 * Atelier payloads. They stay visible through the smallest transparent text
 * seam below; no local chat fold, menu, or synthetic widget is introduced.
 */
export const ATELIER_DATA_RENDERER_LIMITATIONS = {
  activity: "ActivityGraph is unavailable because heat-graph is not installed; AgentStatus carries the activity title and detail.",
  annotations: "No upstream annotation element is available; annotation text remains a plain data label.",
} as const;

function asRecord(value: unknown): RecordData | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordData
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function basename(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

function mimeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) {
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  }
  return "text/plain";
}

function isImageReference(value: string): boolean {
  return /^(?:data:image\/|https?:\/\/|blob:)/iu.test(value);
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function planFromMarkdown(markdown: string): { steps: string[]; activeIndex: number } {
  const rows = markdown.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const listRows = rows.flatMap((line) => {
    const match = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(?:\[([ xX])\]\s+)?(.+)$/u);
    return match ? [{ text: match[2].trim(), done: match[1]?.toLowerCase() === "x" }] : [];
  });
  const parsed = listRows.length ? listRows : rows.map((text) => ({ text, done: false }));
  const activeIndex = parsed.findIndex((step) => !step.done);
  return {
    steps: parsed.map((step) => step.text),
    activeIndex: activeIndex < 0 ? parsed.length : activeIndex,
  };
}

function agentState(value: unknown): AgentState | null {
  const status = stringValue(value)?.toLowerCase();
  if (status === "delivered" || status === "done" || status === "completed" || status === "complete") return "done";
  if (status === "paused" || status === "failed" || status === "errored" || status === "blocked" || status === "waiting" || status === "interrupted" || status === "cancelled" || status === "canceled") return "waiting";
  if (status === "working" || status === "running" || status === "active" || status === "in_progress" || status === "in-progress") return "working";
  return null;
}

function diffLines(file: RecordData): DiffLine[] {
  const unified = stringValue(file.unified);
  if (unified) {
    return unified.split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("@@") && !line.startsWith("+++") && !line.startsWith("---"))
      .map((line) => ({
        kind: line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "context",
        text: /^[+\- ]/u.test(line) ? line.slice(1) : line,
      }));
  }
  const oldText = typeof file.oldText === "string" ? file.oldText : "";
  const newText = typeof file.newText === "string" ? file.newText : "";
  return [
    ...oldText.split(/\r?\n/u).filter(Boolean).map((text) => ({ kind: "removed" as const, text })),
    ...newText.split(/\r?\n/u).filter(Boolean).map((text) => ({ kind: "added" as const, text })),
  ];
}

function openFileEvent(
  path: string,
  options: { diff?: boolean; baseSha?: string | null } | undefined,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("chat-open-file", {
    detail: {
      rel: path,
      line: null,
      diff: options?.diff === true,
      baseSha: options?.baseSha ?? null,
    },
  }));
}

function PathPart({
  path,
  filename,
  diff,
  baseSha,
  host,
  suffix,
}: {
  path: string;
  filename?: string;
  diff?: boolean;
  baseSha?: string | null;
  host: AssistantUiDataHost;
  suffix?: ReactNode;
}) {
  const open = () => {
    if (host.onOpenFile) {
      void host.onOpenFile(path, { diff, baseSha });
    } else {
      openFileEvent(path, { diff, baseSha });
    }
  };

  return (
    <File.Root data-slot="atelier-file-reference" className="tw:w-full tw:max-w-xl">
      <File.Icon mimeType={mimeForPath(path)} />
      <div className="tw:min-w-0 tw:flex-1">
        <File.Name>{filename ?? basename(path)}</File.Name>
        {suffix ? <div className="tw:text-muted-foreground tw:text-xs">{suffix}</div> : null}
      </div>
      <Button type="button" variant="ghost" size="xs" onClick={open}>
        Ouvrir
      </Button>
      {host.onAttachPath ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void host.onAttachPath?.(path)}
        >
          Joindre
        </Button>
      ) : null}
    </File.Root>
  );
}

function AtelierImageData({ data, host, status }: DataProps & { host: AssistantUiDataHost }) {
  const value = asRecord(data);
  const ref = stringValue(value?.ref);
  const [preview, setPreview] = useState<string | null>(() => (
    ref && isImageReference(ref) ? ref : null
  ));
  useEffect(() => {
    if (!ref || isImageReference(ref)) {
      setPreview(ref && isImageReference(ref) ? ref : null);
      return;
    }
    let cancelled = false;
    let ownedUrl: string | null = null;
    setPreview(null);
    void localImagePreviewUrl(ref).then((url) => {
      if (cancelled) {
        if (url.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(url);
        return;
      }
      if (isImageReference(url)) {
        if (url.startsWith("blob:")) ownedUrl = url;
        setPreview(url);
      } else {
        // The browser build deliberately keeps a local path as a file
        // reference; the Tauri build returns a blob URL for the Image part.
      }
    }).catch(() => {
      // Keep the official file affordance when the local preview is missing.
    });
    return () => {
      cancelled = true;
      if (ownedUrl && typeof URL !== "undefined") URL.revokeObjectURL(ownedUrl);
    };
  }, [ref]);
  if (!ref) return null;
  const label = stringValue(value?.label) ?? basename(ref);
  const galleryAction = isImageReference(ref)
    ? null
    : <ImageGallerySave path={ref} threadId={host.threadId} />;
  if (preview) {
    return (
      <div className="tw:flex tw:flex-col tw:items-start tw:gap-1">
        <Image type="image" image={preview} filename={label} status={status} />
        {galleryAction}
      </div>
    );
  }
  // While a Tauri path is being resolved, retain the official file affordance
  // and its host callback; a failed/non-Tauri resolution stays a file path.
  // Once localImagePreviewUrl returns a blob URL the same part upgrades to the
  // official Image element above.
  return (
    <div className="tw:flex tw:flex-col tw:items-start tw:gap-1">
      <PathPart path={ref} filename={label} host={host} />
      {galleryAction}
    </div>
  );
}

type ImageGallerySaveState = "idle" | "saving" | "saved" | "error";

/** Keep the gallery write behind the official image action surface. */
function ImageGallerySave({ path, threadId }: { path: string; threadId?: string | null }) {
  const [state, setState] = useState<ImageGallerySaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Some host tests provide a minimal Tauri-core mock. Keep this action
  // disabled unless the runtime probe is actually present and affirmative.
  const available = Boolean(threadId)
    && (typeof isTauri === "function" ? isTauri() : false);

  const save = async () => {
    if (!available || !threadId || state === "saving" || state === "saved") return;
    setState("saving");
    setError(null);
    try {
      await saveLocalImageToGallery(path, threadId);
      setState("saved");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div data-slot="atelier-image-gallery-action" className="tw:flex tw:items-center tw:gap-2">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={!available || state === "saving" || state === "saved"}
        aria-label="Enregistrer dans la galerie"
        onClick={() => void save()}
      >
        {state === "saving" ? "Enregistrement…" : state === "saved" ? "Enregistrée dans la galerie" : "Enregistrer dans la galerie"}
      </Button>
      {state === "saved" ? <span role="status">Image ajoutée à la galerie.</span> : null}
      {error ? <span role="alert">Impossible d’enregistrer l’image : {error}</span> : null}
    </div>
  );
}

function AttachmentCard({
  name,
  host,
}: {
  name: string;
  host: AssistantUiDataHost;
}) {
  return (
    <File.Root data-slot="atelier-attachment-reference" className="tw:w-full tw:max-w-xl">
      <File.Icon mimeType="text/plain" />
      <File.Name>{name}</File.Name>
      {host.onAttachPath && name.startsWith("/") ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => void host.onAttachPath?.(name)}>
          Joindre
        </Button>
      ) : null}
    </File.Root>
  );
}

function AtelierAttachmentsData({ data, host }: DataProps & { host: AssistantUiDataHost }) {
  const value = asRecord(data);
  const rows: ReactNode[] = [];
  const label = stringValue(value?.label);
  if (label) rows.push(<span key="label">{label}</span>);
  if (Array.isArray(value?.pastes)) {
    for (const [index, paste] of value.pastes.entries()) {
      const item = asRecord(paste);
      const name = stringValue(item?.name);
      if (name) rows.push(<AttachmentCard key={`paste:${index}`} name={name} host={host} />);
    }
  }
  const kb = asRecord(value?.kb);
  if (Array.isArray(kb?.titles)) {
    for (const [index, title] of kb.titles.entries()) {
      const name = stringValue(title);
      if (name) rows.push(<AttachmentCard key={`kb:${index}`} name={name} host={host} />);
    }
  }
  return rows.length ? <div data-slot="atelier-attachments">{rows}</div> : null;
}

function AtelierEditData({ data, host }: DataProps & { host: AssistantUiDataHost }) {
  const value = asRecord(data);
  const files = Array.isArray(value?.files) ? value.files : [];
  const baseSha = stringValue(value?.baseSha);
  return (
    <div data-slot="atelier-edit" className="tw:flex tw:flex-col tw:gap-1">
      {files.map((item, index) => {
        const file = asRecord(item);
        const path = stringValue(file?.path);
        if (!path) return null;
        const add = numberValue(file?.add);
        const del = numberValue(file?.del);
        const suffix = [
          add != null ? `+${add}` : null,
          del != null ? `−${del}` : null,
        ].filter(Boolean).join(" · ");
        const lines = file ? diffLines(file) : [];
        return (
          <div key={`${path}:${index}`} className="tw:flex tw:flex-col tw:gap-1">
            <PathPart
              path={path}
              diff
              baseSha={baseSha}
              host={host}
              suffix={suffix || undefined}
            />
            {lines.length ? (
              <CodeDiff
                filename={basename(path)}
                additions={add ?? lines.filter((line) => line.kind === "added").length}
                deletions={del ?? lines.filter((line) => line.kind === "removed").length}
                lines={lines}
                cycle={index}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function agentFromData(data: unknown): AgentDisplay | null {
  const value = asRecord(data);
  const threadId = stringValue(value?.peerThreadId);
  if (!threadId) return null;
  const rawStatus = stringValue(value?.status)?.toLowerCase();
  const status: AgentDisplay["status"] | null = rawStatus === "failed"
    ? "failed"
    : rawStatus === "paused" || rawStatus === "interrupted" || rawStatus === "cancelled" || rawStatus === "canceled"
      ? "interrupted"
      : rawStatus === "delivered" || rawStatus === "done" || rawStatus === "completed" || rawStatus === "complete"
        ? "done"
        : rawStatus === "working" || rawStatus === "running" || rawStatus === "active" || rawStatus === "in_progress" || rawStatus === "in-progress"
          ? "working"
          : null;
  if (!status) return null;
  return {
    threadId,
    displayName: stringValue(value?.peerTitle) ?? stringValue(value?.peerProvider) ?? "Agent",
    status,
    statusMessage: stringValue(value?.text),
    prompt: null,
    model: null,
    reasoningEffort: null,
    agentPath: null,
  };
}

function AtelierAgentMessageData({ data, host }: DataProps & { host: AssistantUiDataHost }) {
  const value = asRecord(data);
  const text = stringValue(value?.text);
  const agent = agentFromData(data);
  if (!text && !agent) return null;
  return (
    <div data-slot="atelier-agent-message" role="status" className="tw:flex tw:flex-col tw:items-start tw:gap-1">
      {agent ? (() => {
        const state = agentState(agent.status);
        return state ? <AgentStatus state={state} label={agent.displayName} /> : null;
      })() : null}
      {text ? <span>{text}</span> : null}
      {agent && host.onOpenAgent ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => void host.onOpenAgent?.(agent)}>
          Ouvrir
        </Button>
      ) : null}
    </div>
  );
}

function AtelierActivityData({ data }: DataProps) {
  const value = asRecord(data);
  const title = stringValue(value?.title);
  const detail = stringValue(value?.detail);
  const status = stringValue(value?.status);
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  if (!title && !detail && !steps.length) return null;
  return (
    <div data-slot="atelier-activity" role={status === "running" ? "status" : undefined} className="tw:flex tw:flex-col tw:items-start tw:gap-1">
      {(() => {
        const state = agentState(status);
        return state ? <AgentStatus state={state} label={title ?? "Activité"} /> : null;
      })()}
      {detail ? <span>{detail}</span> : null}
      {steps.length ? (
        <span className="tw:text-muted-foreground tw:text-xs">
          {steps.map((step, index) => {
            const item = asRecord(step);
            return `${index ? " · " : ""}${stringValue(item?.title) ?? "Étape"}${stringValue(item?.status) ? ` (${item?.status})` : ""}`;
          }).join("")}
        </span>
      ) : null}
    </div>
  );
}

function AtelierPlanData({ data }: DataProps) {
  const value = asRecord(data);
  const markdown = stringValue(value?.markdown);
  if (!markdown) return null;
  const plan = planFromMarkdown(markdown);
  return <AgentPlan data-slot="atelier-plan" {...plan} />;
}

function AtelierTodosData({ data }: DataProps) {
  const items = Array.isArray(data) ? data : [];
  if (!items.length) return null;
  const todos: TodoItem[] = items.flatMap((entry, index) => {
    const item = asRecord(entry);
    if (!item) return [];
    const text = stringValue(item.text) ?? "Tâche";
    const completed = booleanValue(item.completed) === true;
    const active = booleanValue(item.active) === true;
    return [{ id: `${index}:${text}`, text, status: completed ? "done" : active ? "active" : "pending" }];
  });
  return <TodoList data-slot="atelier-todos" items={todos} />;
}

function AtelierGoalData({ data }: DataProps) {
  const value = asRecord(data);
  const goal = asRecord(value?.goal);
  const objective = stringValue(goal?.objective);
  if (!objective) return null;
  const status = stringValue(goal?.status);
  const state = agentState(status);
  return state
    ? <AgentStatus data-slot="atelier-goal" state={state} label={objective} />
    : <span data-slot="atelier-goal">{objective}</span>;
}

function AtelierAnnotationsData({ data }: DataProps) {
  const notes = Array.isArray(data) ? data : [];
  if (!notes.length) return null;
  return <span data-slot="atelier-annotations">
    {notes.map((entry, index) => {
      const item = asRecord(entry);
      return `${index ? " · " : ""}${item?.n != null ? `${String(item.n)}. ` : ""}${stringValue(item?.text) ?? "Annotation"}`;
    }).join("")}
  </span>;
}

function AtelierErrorData({ data }: DataProps) {
  const message = stringValue(asRecord(data)?.message);
  return message ? (
    <ToolError
      data-slot="atelier-error"
      name="Atelier"
      target="stream"
      message={message}
      attempt={1}
      maxAttempts={1}
      retrying={false}
    />
  ) : null;
}

function AtelierWidgetData({ data, host }: DataProps & { host: AssistantUiDataHost }) {
  const value = asRecord(data);
  const id = stringValue(value?.id);
  const title = stringValue(value?.title);
  const height = numberValue(value?.height);
  if (!id || !title || height == null) return null;
  const event: WidgetEvent = { kind: "widget", id, title, height };
  // WidgetFrame owns the sidecar fetch, sandbox, ready/resize protocol and
  // retry state. AgentEvent intentionally carries only id/title/height; the
  // HTML payload is resolved by the existing business path using threadId.
  return <WidgetFrame event={event} threadId={host.threadId ?? null} />;
}

type AssistantUiDataHostRef = { current: AssistantUiDataHost };

/**
 * Keep the registry identity stable for the lifetime of one assistant-ui
 * runtime.  App callbacks are intentionally inline (their closure follows
 * the active thread), so putting them in the registration effect's
 * dependency list would unregister/register every host rerender and make the
 * data-renderer store rerender recursively.  The renderer wrappers read the
 * latest host ref when assistant-ui invokes them instead.
 */
const namedRenderers = (hostRef: AssistantUiDataHostRef): Record<AtelierDataPartName, DataMessagePartComponent> => ({
  "atelier-activity": AtelierActivityData,
  "atelier-agent-message": (props) => <AtelierAgentMessageData {...props} host={hostRef.current} />,
  "atelier-annotations": AtelierAnnotationsData,
  "atelier-attachments": (props) => <AtelierAttachmentsData {...props} host={hostRef.current} />,
  "atelier-edit": (props) => <AtelierEditData {...props} host={hostRef.current} />,
  "atelier-error": AtelierErrorData,
  "atelier-goal": AtelierGoalData,
  "atelier-image": (props) => <AtelierImageData {...props} host={hostRef.current} />,
  "atelier-plan": AtelierPlanData,
  "atelier-todos": AtelierTodosData,
  "atelier-widget": (props) => <AtelierWidgetData {...props} host={hostRef.current} />,
});

/** Register every provider-specific projection part in the official data registry. */
export function AssistantUiData(host: AssistantUiDataHost = {}) {
  const aui = useAui();
  // This component is remounted with its conversation's runtime. Keep its
  // registry binding and renderer identities stable for that lifetime;
  // changing host callbacks are read through hostRef instead of re-registering.
  const dataRenderers = useRef(aui.dataRenderers).current;
  const hostRef = useRef<AssistantUiDataHost>(host);
  hostRef.current = host;
  const renderers = useMemo(() => namedRenderers(hostRef), []);

  useEffect(() => {
    const unregister = ATELIER_DATA_PART_NAMES.map((name) => (
      dataRenderers.setDataUI(name, renderers[name])
    ));
    return () => {
      for (const dispose of unregister) dispose();
    };
  }, [dataRenderers, renderers]);

  return null;
}

export {
  AtelierActivityData,
  AtelierAgentMessageData,
  AtelierAnnotationsData,
  AtelierAttachmentsData,
  AtelierEditData,
  AtelierErrorData,
  AtelierGoalData,
  AtelierImageData,
  AtelierPlanData,
  AtelierTodosData,
  AtelierWidgetData,
};
