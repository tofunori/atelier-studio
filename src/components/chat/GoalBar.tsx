// Barre de goal épinglée au composer (goal natif Codex app-server) : une seule
// surface persistante — objectif, statut, temps/tokens — avec pause/reprise,
// édition en place et arrêt réel (goalClear + interrupt, car turn/interrupt
// seul laisse le goal actif côté serveur).
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";
import { Input } from "../shadcn/input";
import { Progress } from "../shadcn/progress";
import { Button, RowButton } from "../ui";

export type GoalInfo = NonNullable<Extract<AgentEvent, { kind: "goal" }>["goal"]>;

function fmtGoalTime(s: number): string {
  const sec = Math.max(0, Math.round(s));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function fmtTokens(goal: GoalInfo): string | null {
  if (goal.tokenBudget != null)
    return `${Math.round((goal.tokensUsed ?? 0) / 1000)}k / ${Math.round(goal.tokenBudget / 1000)}k`;
  if (goal.tokensUsed > 0) return `${Math.round(goal.tokensUsed / 1000)}k`;
  return null;
}

export const GoalGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
  </svg>
);

export function GoalBar(props: {
  goal: GoalInfo;
  onGoal: (action: "set" | "clear", objective?: string, status?: "active" | "paused") => void;
  onStop: () => void;
}) {
  const { goal, onGoal, onStop } = props;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(goal.objective);
  // l'objectif peut changer sous nos pieds (édition /goal, autre fenêtre) —
  // resynchronise le brouillon tant qu'une édition n'est pas en cours
  useEffect(() => { if (!editing) setEditText(goal.objective); }, [goal.objective, editing]);

  const paused = goal.status === "paused";
  const active = goal.status === "active";
  // blocked : le moteur de goals attend l'utilisateur (objectif flou, question
  // posée dans le fil) — relançable via goalSet status:"active"
  const resumable = paused || goal.status === "blocked";
  const statusLabel = goal.status === "blocked"
    ? t("goal.status.awaiting")
    : t(`goal.status.${goal.status}` as Parameters<typeof t>[0]);
  const tokens = fmtTokens(goal);
  const tokenProgress = goal.tokenBudget && goal.tokenBudget > 0
    ? Math.min(100, Math.max(0, (goal.tokensUsed / goal.tokenBudget) * 100))
    : null;

  const commitEdit = () => {
    const v = editText.trim();
    if (v && v !== goal.objective) onGoal("set", v, paused ? "paused" : "active");
    setEditing(false);
  };

  return (
    <div className={`goal-bar ${goal.status}${open ? " open" : ""}`}>
      <div className="goal-head">
        <RowButton
          className="goal-bar-summary"
          title={t("goal.expand")}
          aria-expanded={open}
          onClick={() => { setOpen((v) => !v); setEditing(false); }}
        >
          <span className="goal-bar-glyph"><GoalGlyph /></span>
          <span className="goal-bar-copy">
            <span className="goal-bar-kicker">
              <span className="goal-bar-label">{t("goal.live")}</span>
              <span className="goal-bar-status">{statusLabel}</span>
              {goal.timeUsedSeconds > 0 && <span className="goal-bar-time">{fmtGoalTime(goal.timeUsedSeconds)}</span>}
            </span>
            <span className="goal-bar-obj" title={goal.objective}>{goal.objective}</span>
          </span>
          <svg className="goal-bar-chev" width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 2.5l4 4-4 4" /></svg>
        </RowButton>
        <span className="goal-bar-actions">
          {(active || resumable) && (
            <RowButton
              className="goal-bar-control" title={resumable ? t("goal.resume") : t("goal.pause")}
              onClick={() => onGoal("set", goal.objective, resumable ? "active" : "paused")}
            >
              {resumable
                ? <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.8l6 3.7-6 3.7z" /></svg>
                : <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M4.4 2.8v7.4M8.6 2.8v7.4" /></svg>}
              <span>{resumable ? t("goal.resume-short") : t("goal.pause-short")}</span>
            </RowButton>
          )}
        </span>
      </div>
      {open && !editing && (
        <div className="goal-bar-details">
          <div className="goal-bar-meta" aria-label={t("goal.details")}>
            {goal.timeUsedSeconds > 0 && <span>{t("goal.time")} : {fmtGoalTime(goal.timeUsedSeconds)}</span>}
            {tokens && <span>{t("goal.tokens")} : {tokens}</span>}
            <span>{statusLabel}</span>
            {tokenProgress != null && (
              <Progress
                className="goal-bar-progress"
                value={tokenProgress}
                aria-label={`${t("goal.tokens")} : ${tokens}`}
              />
            )}
          </div>
          <div className="goal-bar-detail-actions">
            <Button
              variant="ghost" className="goal-bar-detail-btn" title={t("goal.edit")}
              onClick={() => { setEditing(true); setOpen(true); }}
            >
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 1.8l1.7 1.7L4.5 10.2l-2.3.6.6-2.3z" /></svg>
              <span>{t("goal.edit-short")}</span>
            </Button>
            <Button
              variant="danger" className="goal-bar-detail-btn goal-bar-stop" title={t("goal.stop")}
              onClick={() => { onGoal("clear"); onStop(); }}
            >
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.2 3.5h8.6M5 3.5V2.2h3v1.3M3.3 3.5l.5 7.3h5.4l.5-7.3M5.3 5.5v3.5M7.7 5.5v3.5" /></svg>
              <span>{t("goal.stop-short")}</span>
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <div className="goal-bar-edit">
          <Input
            autoFocus
            value={editText}
            onChange={(ev) => setEditText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") { ev.preventDefault(); commitEdit(); }
              if (ev.key === "Escape") { ev.stopPropagation(); setEditing(false); setEditText(goal.objective); }
            }}
          />
          <Button variant="ghost" className="ghost goal-bar-save" onClick={commitEdit}>{t("goal.update")}</Button>
          <Button variant="ghost" className="ghost" onClick={() => { setEditing(false); setEditText(goal.objective); }}>
            {t("action.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
