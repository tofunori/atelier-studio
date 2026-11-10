// Thread-level goal: compact controls stay attached to the prompt;
// the complete objective remains available without truncation in the disclosure.
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { Button, RowButton } from "../ui";

import { ChevronDownIcon, PauseIcon, PencilIcon, PlayIcon, SquareIcon, TargetIcon } from "lucide-react";
export type GoalInfo = NonNullable<Extract<AgentEvent, { kind: "goal" }>["goal"]>;

export function fmtGoalTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m < 60 ? `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const GoalGlyph = ({ size = 16 }: { size?: number }) => (
  <TargetIcon size={size} />
);

const Pencil = () => <PencilIcon size={14} />;

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
            {resumable ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
          </RowButton>}
          <RowButton ref={editButton} className="goal-bar-control" title={t("goal.edit")} aria-label={t("goal.edit")} onClick={() => { setOpen(true); setEditing(true); }}><Pencil /></RowButton>
          <RowButton className="goal-bar-control goal-bar-stop" title={t("goal.stop")} aria-label={t("goal.stop")} onClick={() => { onGoal("clear"); onStop(); }}>
            <SquareIcon size={14} />
          </RowButton>
          <RowButton className="goal-bar-control" title={open ? t("action.close") : t("goal.details")} aria-label={t("goal.details")} aria-expanded={open} onClick={() => { setOpen(!open); setEditing(false); }}>
            <ChevronDownIcon size={12} className="goal-bar-chev" />
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
            <Button variant="ghost" size="sm" onClick={finishEdit}>{t("action.cancel")}</Button>
            <Button variant="primary" size="sm" disabled={!editText.trim()} onClick={save}>{t("goal.update")}</Button>
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
