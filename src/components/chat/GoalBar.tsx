// Thread-level goal: compact controls stay attached to the prompt;
// the complete objective remains available without truncation in the disclosure.
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { RowButton } from "../ui";

export type GoalInfo = NonNullable<Extract<AgentEvent, { kind: "goal" }>["goal"]>;

export function fmtGoalTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m < 60 ? `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const GoalGlyph = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.6 8a7.5 7.5 0 1 1-4.6-4.6M13.3 9a4 4 0 1 1-2.3-2.3" />
    <path d="m9 11 8-8m-3 3 .3-3.3L17 1l-.2 2.2L19 3l-1.7 2.7L14 6" />
    <circle cx="9" cy="11" r=".8" />
  </svg>
);

const Pencil = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11.5 2 2.5 2.5-8.5 8.5-3.5 1 1-3.5ZM10 3.5 12.5 6" /></svg>;

export function GoalBar({ goal, onGoal, onStop }: {
  goal: GoalInfo;
  onGoal: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  onStop: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(goal.objective);
  const [elapsed, setElapsed] = useState(goal.timeUsedSeconds || 0);
  const editButton = useRef<HTMLButtonElement>(null);
  const active = goal.status === "active";
  const resumable = goal.status === "paused" || goal.status === "blocked";
  const statusLabel = goal.status === "blocked" ? t("goal.status.awaiting")
    : t(`goal.status.${goal.status}` as Parameters<typeof t>[0]);
  useEffect(() => { if (!editing) setEditText(goal.objective); }, [goal.objective, editing]);
  const clock = useRef({ key: goal.createdAt ?? goal.objective, base: goal.timeUsedSeconds || 0, at: performance.now(), running: active });
  useEffect(() => {
    const key = goal.createdAt ?? goal.objective;
    const previous = clock.current;
    const projected = previous.base + (previous.running ? (performance.now() - previous.at) / 1000 : 0);
    const base = Math.max(0, goal.timeUsedSeconds || 0, previous.key === key ? projected : 0);
    const started = performance.now();
    clock.current = { key, base, at: started, running: active };
    setElapsed(base);
    if (!active) return;
    const id = window.setInterval(() => setElapsed(base + (performance.now() - started) / 1000), 1000);
    return () => window.clearInterval(id);
  }, [goal, active]);
  const finishEdit = () => { setEditing(false); editButton.current?.focus(); };
  const save = () => {
    const value = editText.trim();
    if (!value) return;
    if (value !== goal.objective) onGoal("set", value, goal.status === "paused" ? "paused" : "active");
    finishEdit();
  };
  return (
    <div className={`goal-bar ${goal.status}${open ? " open" : ""}`}>
      <div className="goal-head">
        <span className="goal-bar-glyph" title={statusLabel}><GoalGlyph /></span>
        <RowButton className="goal-bar-summary" title={t("goal.expand")} aria-label={`${t("goal.expand")} — ${statusLabel}`} aria-expanded={open}
          onClick={() => { setOpen(!open); setEditing(false); }}>
          <span className="goal-bar-obj" title={goal.objective}>{goal.objective}</span>
        </RowButton>
        <span className="goal-bar-time" title={t("goal.time")} aria-label={`${t("goal.time")} : ${fmtGoalTime(elapsed)}`}>{fmtGoalTime(elapsed)}</span>
        <span className="goal-bar-actions">
          {(active || resumable) && <RowButton className="goal-bar-control" title={resumable ? t("goal.resume") : t("goal.pause")} aria-label={resumable ? t("goal.resume") : t("goal.pause")}
            onClick={() => onGoal("set", goal.objective, resumable ? "active" : "paused")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {resumable ? <path d="m4 2.5 7 4.5-7 4.5z" /> : <path d="M4.5 3v8M9.5 3v8" />}
            </svg>
          </RowButton>}
          <RowButton ref={editButton} className="goal-bar-control" title={t("goal.edit")} aria-label={t("goal.edit")} onClick={() => { setOpen(true); setEditing(true); }}><Pencil /></RowButton>
          <RowButton className="goal-bar-control goal-bar-stop" title={t("goal.stop")} aria-label={t("goal.stop")} onClick={() => { onGoal("clear"); onStop(); }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /></svg>
          </RowButton>
          <RowButton className="goal-bar-control" title={open ? t("action.close") : t("goal.details")} aria-label={t("goal.details")} aria-expanded={open} onClick={() => { setOpen(!open); setEditing(false); }}>
            <svg className="goal-bar-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
          </RowButton>
        </span>
      </div>
      {open && <div className="goal-bar-details">
        {editing ? <div className="goal-bar-edit">
          <textarea autoFocus aria-label={t("goal.edit")} value={editText} rows={4} onChange={e => setEditText(e.target.value)} onKeyDown={e => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishEdit(); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          }} />
          <div className="goal-bar-detail-actions">
            <RowButton className="goal-bar-control" title={t("action.cancel")} aria-label={t("action.cancel")} onClick={finishEdit}>×</RowButton>
            <RowButton className="goal-bar-control" title={t("goal.update")} aria-label={t("goal.update")} disabled={!editText.trim()} onClick={save}>✓</RowButton>
          </div>
        </div> : <p className="goal-bar-objective">{goal.objective}</p>}
        <div className="goal-bar-meta">
          <span>{statusLabel}</span>
          {(goal.tokensUsed > 0 || goal.tokenBudget != null) && <span>{t("goal.tokens")} : {new Intl.NumberFormat().format(goal.tokensUsed || 0)}{goal.tokenBudget != null ? ` / ${new Intl.NumberFormat().format(goal.tokenBudget)}` : ""}</span>}
        </div>
      </div>}
    </div>
  );
}
