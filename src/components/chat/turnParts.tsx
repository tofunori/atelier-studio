// Pièces de tour du chat (plan 015, slice 4) — déplacées verbatim depuis
// Chat.tsx : diff de fin de tour, ré-édition d'un edit, thinking, indicateur
// Working, carte d'activité, épingle. Aucune logique modifiée.
import { useEffect, useRef, useState } from "react";
import { AgentEvent } from "../../lib/ws";
import { wsSend } from "../../lib/wsBus";
import { t } from "../../lib/i18n";
import { diffLineClass, openFileRef } from "./md";
import { Tick } from "./toolPresentation";
import { ActivityDisclosure, IconButton, Tooltip } from "../ui";

export function DoneDiffToggle({ event, threadId }: {
  event: Extract<AgentEvent, { kind: "done" }>;
  threadId: string | null;
}) {
  const files = event.filesChanged ?? [];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState("");

  useEffect(() => {
    const onDiff = (ev: Event) => {
      const msg = (ev as CustomEvent).detail;
      if (event.projectRoot && msg.projectRoot !== event.projectRoot) return;
      setDiff(String(msg.diff ?? ""));
      setLoading(false);
    };
    window.addEventListener("git-diff", onDiff);
    return () => window.removeEventListener("git-diff", onDiff);
  }, [event.projectRoot]);

  if (!files.length) return null;
  return (
    <div className="turn-diff">
      <button
        type="button"
        className="turn-diff-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next || diff || loading) return;
          setLoading(true);
          const sent = wsSend({
            type: "gitDiff",
            threadId,
            projectRoot: event.projectRoot,
          });
          if (!sent) setLoading(false);
        }}
      >
        <span>{t("chat.files-modified", { count: files.length })}</span>
        <Tick open={open} />
      </button>
      {event.checkpoint ? (
        <button
          type="button"
          className="turn-diff-undo"
          title={t("checkpoint.files-title")}
          onClick={() => {
            if (!window.confirm(t("checkpoint.files-confirm"))) return;
            wsSend({
              type: "revert",
              scope: "files",
              threadId,
              turnId: "meta" in event && event.meta && "turnId" in event.meta ? event.meta.turnId : undefined,
              snapshotSha: event.checkpoint?.snapshotSha,
            });
          }}
        >
          {t("checkpoint.undo-files")}
        </button>
      ) : null}
      {open && (
        <pre className="turn-diff-body">
          {loading && !diff ? (
            <span className="muted">{t("common.loading")}</span>
          ) : diff.trim() ? (
            diff.split("\n").map((line, idx) => (
              <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
            ))
          ) : (
            <span className="muted">{t("git.diff-empty")}</span>
          )}
        </pre>
      )}
    </div>
  );
}

// ligne « fichier édité » : nom + ±lignes, clic = diff du fichier déplié
export function EditLine({ event, threadId }: {
  event: Extract<AgentEvent, { kind: "edit" }>;
  threadId: string | null;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const onDiff = (ev: Event) => {
      const msg = (ev as CustomEvent).detail;
      if (!msg.path) return;
      if (event.projectRoot && msg.projectRoot !== event.projectRoot) return;
      if (msg.error) {
        setErrors((current) => ({ ...current, [msg.path]: String(msg.error) }));
        setLoading((current) => (current === msg.path ? null : current));
        return;
      }
      setDiffs((d) => ({ ...d, [msg.path]: String(msg.diff ?? "") }));
      setErrors((current) => {
        const next = { ...current };
        delete next[msg.path];
        return next;
      });
      setLoading((l) => (l === msg.path ? null : l));
    };
    window.addEventListener("git-diff", onDiff);
    return () => window.removeEventListener("git-diff", onDiff);
  }, [event.projectRoot]);

  if (!event.files?.length) return null;
  return (
    <div className="edit-lines">
      {event.files.map((f) => {
        const base = f.path.split("/").pop() || f.path;
        const open = openPath === f.path;
        const diff = diffs[f.path];
        const error = errors[f.path];
        return (
          <div key={f.path} className="edit-line">
            <div className="edit-line-row" title={f.path}>
              <button
                type="button"
                className="edit-line-open"
                onClick={() => openFileRef(f.path)}
                title={t("action.open-file", { ref: f.path })}
              >
                <PencilIcon />
                <span className="edit-line-verb">{t("chat.edited")}</span>
                <span className="edit-line-file">{base}</span>
                {f.add != null && <span className="edit-line-add">+{f.add}</span>}
                {f.del != null && <span className="edit-line-del">-{f.del}</span>}
              </button>
              <button
                type="button"
                className="edit-line-difftoggle"
                aria-expanded={open}
                title="diff"
                onClick={() => {
                  const next = open ? null : f.path;
                  setOpenPath(next);
                  if (!next || diffs[f.path] != null || loading === f.path) return;
                  setErrors((current) => {
                    const following = { ...current };
                    delete following[f.path];
                    return following;
                  });
                  setLoading(f.path);
                  const sent = wsSend({
                    type: "gitDiff",
                    requestId: crypto.randomUUID(),
                    threadId,
                    projectRoot: event.projectRoot,
                    path: f.path,
                  });
                  if (!sent) setLoading(null);
                  else window.setTimeout(() => {
                    setLoading((current) => {
                      if (current !== f.path) return current;
                      setErrors((existing) => ({ ...existing, [f.path]: t("chat.diff-timeout") }));
                      return null;
                    });
                  }, 8000);
                }}
              >
                <Tick open={open} />
              </button>
            </div>
            {open && (
              <pre className="turn-diff-body">
                {loading === f.path && diff == null ? (
                  <span className="muted">{t("common.loading")}</span>
                ) : error ? (
                  <span className="muted">{error}</span>
                ) : diff?.trim() ? (
                  diff.split("\n").map((line, idx) => (
                    <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
                  ))
                ) : (
                  <span className="muted">{t("git.diff-empty")}</span>
                )}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.3 2.3l2.4 2.4L5.4 13H3v-2.4z" />
    </svg>
  );
}

// bloc `pre` du message final : language-mermaid → diagramme (jamais en
// streaming, cf. MD_COMPONENTS_STREAMING plus bas), sinon bloc de code coloré
// habituel.
export function fmtTime(ts: number, fmt?: "system" | "24h" | "12h") {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (fmt === "24h") opts.hour12 = false;
  if (fmt === "12h") opts.hour12 = true;
  return new Date(ts).toLocaleTimeString([], opts);
}

/** « Williamson et al. - 2025 - Temperature… .pdf » → « Williamson et al. 2025 » ; sinon nom court. */
export function citeLabel(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = /^(.{2,60}?)\s+-\s+(\d{4})\s+-\s+/.exec(base);
  if (m) return `${m[1]} ${m[2]}`;
  return base.length > 34 ? base.slice(0, 33) + "…" : base;
}

export function formatPermInput(tool: string, input: Record<string, unknown>): string {
  const one = (v: unknown) => String(v ?? "").slice(0, 400);
  if (tool === "Bash") return one((input as any).command);
  if ((input as any).file_path) return one((input as any).file_path);
  const s = JSON.stringify(input, null, 1);
  return s.length > 400 ? s.slice(0, 400) + "…" : s;
}

export function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const normalized = text.trim();
  const preview = normalized.replace(/\s+/g, " ").slice(-140);
  if (!normalized) return null;
  return (
    <div className={`thinking ${live ? "live" : ""}`}>
      <button type="button" className="thinking-head" onClick={() => setOpen((v) => !v)}>
        <Tick open={open} />
        <span className="thinking-label">{live ? t("chat.thinking-live") : t("chat.thinking")}</span>
        {!open && <span className="thinking-preview">{preview}</span>}
      </button>
      {open && <div className="thinking-body">{normalized}</div>}
    </div>
  );
}

export function reasoningSummary(text: string): string {
  const lines = text
    .replace(/<!--[\s\S]*?-->/gu, "")
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("<!--"));
  const line = lines[lines.length - 1];
  if (!line) return "";
  const cleaned = line
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/^__(.+)__$/u, "$1")
    .replace(/^`(.+)`$/u, "$1")
    .trim()
    .replace(/^reasoning(?:\s+(?:update|trace|summary))?\b[\s:.-]*/iu, "")
    .replace(/^running\b[\s:.-]*/iu, "")
    .trim();
  return cleaned || line;
}

/** Synara consolide les mises à jour reasoning consécutives et montre la
 * dernière phrase utile. Le journal complet reste accessible au clic. */
export function ReasoningTrace({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  const normalized = texts.map((text) => text.trim()).filter(Boolean);
  const latest = normalized[normalized.length - 1] ?? "";
  const summary = reasoningSummary(latest);
  if (!summary) return null;
  return (
    <div className="reasoning-trace">
      <button
        type="button"
        className="reasoning-trace-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="reasoning-trace-summary">{summary}</span>
        <Tick open={open} />
      </button>
      {open ? <div className="reasoning-trace-body">{normalized.join("\n\n")}</div> : null}
    </div>
  );
}

function workDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function Working({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const duration = workDuration(Date.now() - since);
  return (
    <div className="working working-header">
      <span className="working-label">{t("chat.working-elapsed", { duration })}</span>
      <div className="working-divider" aria-hidden="true" />
    </div>
  );
}

/** Indicateur unique placé à la position courante du tour. Le texte balayé
 * remplace les sentinelles `thinking` vides et répétées du provider. */
export function ThinkingShimmer({ text = t("chat.thinking") }: { text?: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;

    let sweepTimer: number | undefined;
    let cadenceTimer: number | undefined;
    const sweep = () => {
      if (sweepTimer !== undefined) window.clearTimeout(sweepTimer);
      root.classList.remove("is-sweeping");
      void root.offsetWidth;
      root.classList.add("is-sweeping");
      sweepTimer = window.setTimeout(() => {
        root.classList.remove("is-sweeping");
        sweepTimer = undefined;
      }, 650);
    };
    const startTimer = window.setTimeout(() => {
      sweep();
      cadenceTimer = window.setInterval(sweep, 4_000);
    }, 600);

    return () => {
      window.clearTimeout(startTimer);
      if (sweepTimer !== undefined) window.clearTimeout(sweepTimer);
      if (cadenceTimer !== undefined) window.clearInterval(cadenceTimer);
      root.classList.remove("is-sweeping");
    };
  }, []);

  return (
    <span ref={rootRef} className="thinking-shimmer">
      {text}
      <span className="thinking-shimmer-sweep" aria-hidden="true">
        <span className="thinking-shimmer-highlight">{text}</span>
      </span>
    </span>
  );
}

export function LiveThinking() {
  return (
    <div className="thinking-live-indicator" role="status" aria-live="polite">
      <ThinkingShimmer />
    </div>
  );
}

export function ActivityCard({ event, live }: { event: Extract<AgentEvent, { kind: "activity" }>; live: boolean }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? live;
  const steps = event.steps ?? [];
  const status = event.status === "failed" ? "failed" : live || event.status === "running" ? "running" : "completed";
  return (
    <ActivityDisclosure open={open} status={status}
      onToggle={() => setManualOpen((v) => !(v ?? live))}
      label={<><span className="activity-title">{event.title}</span>{event.detail && <span className="activity-detail">{event.detail}</span>}</>}
      meta={steps.length > 0 ? t("chat.actions-used", { count: steps.length }) : undefined}>
        <div className="activity-steps">
          {steps.map((step, idx) => (
            <div key={`${step.title}-${idx}`} className={`activity-step ${step.status ?? "running"}`}>
              <span className="activity-step-dot" aria-hidden="true" />
              <span className="activity-step-title">{step.title}</span>
              {step.detail && <span className="activity-step-detail">{step.detail}</span>}
            </div>
          ))}
        </div>
    </ActivityDisclosure>
  );
}

export function PinBtn({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  const label = pinned ? t("action.unpin-chapter") : t("action.pin-chapter");
  return (
    <Tooltip label={label}>
      <IconButton
        size="s"
        label={label}
        onClick={onClick}
        aria-pressed={pinned}
        className={`msg-action${pinned ? " is-active" : ""}`}
      >
        <svg data-icon="inline-start" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M9.5 2.5l4 4-3 1-2.5 4.5-4-4L8.5 5.5l1-3z" />
          <path d="M5.5 10.5L2.5 13.5" />
        </svg>
      </IconButton>
    </Tooltip>
  );
}
