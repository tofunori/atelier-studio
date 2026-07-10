// Barre de goal épinglée au composer (goal natif Codex app-server) : une seule
// surface persistante — objectif, statut, temps/tokens — avec pause/reprise,
// édition en place et arrêt réel (goalClear + interrupt, car turn/interrupt
// seul laisse le goal actif côté serveur).
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import type { AgentEvent } from "../../lib/ws";

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

const GoalGlyph = ({ size = 14 }: { size?: number }) => (
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
  const label = active ? t("goal.pinned.active") : paused ? t("goal.pinned.paused") : t("goal.live");
  const tokens = fmtTokens(goal);

  const commitEdit = () => {
    const v = editText.trim();
    if (v && v !== goal.objective) onGoal("set", v, paused ? "paused" : "active");
    setEditing(false);
  };

  return (
    <div className={`goal-bar ${goal.status}${open ? " open" : ""}`}>
      <div className="goal-head">
        <GoalGlyph />
        <span className="goal-bar-label">{label}</span>
        <span className="goal-bar-obj" title={goal.objective}>{goal.objective}</span>
        {active && <span className="goal-bar-dot" aria-hidden="true" />}
        {goal.timeUsedSeconds > 0 && <span className="goal-bar-time">{fmtGoalTime(goal.timeUsedSeconds)}</span>}
        <span className="goal-bar-badge">{t(`goal.status.${goal.status}` as Parameters<typeof t>[0])}</span>
        <span className="goal-bar-actions">
          <button
            type="button" className="goal-bar-btn" title={t("goal.edit")}
            onClick={() => { setEditing(true); setOpen(true); }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 1.8l1.7 1.7L4.5 10.2l-2.3.6.6-2.3z" /></svg>
          </button>
          {(active || paused) && (
            <button
              type="button" className="goal-bar-btn" title={paused ? t("goal.resume") : t("goal.pause")}
              onClick={() => onGoal("set", goal.objective, paused ? "active" : "paused")}
            >
              {paused
                ? <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.8l6 3.7-6 3.7z" /></svg>
                : <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M4.4 2.8v7.4M8.6 2.8v7.4" /></svg>}
            </button>
          )}
          <button
            type="button" className="goal-bar-btn goal-bar-stop" title={t("goal.stop")}
            onClick={() => { onGoal("clear"); onStop(); }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.2 3.5h8.6M5 3.5V2.2h3v1.3M3.3 3.5l.5 7.3h5.4l.5-7.3M5.3 5.5v3.5M7.7 5.5v3.5" /></svg>
          </button>
          <button
            type="button" className="goal-bar-btn" title={t("goal.expand")}
            aria-expanded={open}
            onClick={() => { setOpen((v) => !v); setEditing(false); }}
          >
            <svg className="goal-bar-chev" width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5l4 4-4 4" /></svg>
          </button>
        </span>
      </div>
      {open && !editing && (
        <>
          <div className="goal-bar-body">{goal.objective}</div>
          <div className="goal-bar-meta">
            {goal.timeUsedSeconds > 0 && <span>{t("goal.time")} : {fmtGoalTime(goal.timeUsedSeconds)}</span>}
            {tokens && <span>{t("goal.tokens")} : {tokens}</span>}
            <span>{t(`goal.status.${goal.status}` as Parameters<typeof t>[0])}</span>
          </div>
        </>
      )}
      {editing && (
        <div className="goal-bar-edit">
          <input
            autoFocus
            value={editText}
            onChange={(ev) => setEditText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") { ev.preventDefault(); commitEdit(); }
              if (ev.key === "Escape") { ev.stopPropagation(); setEditing(false); setEditText(goal.objective); }
            }}
          />
          <button type="button" className="ghost goal-bar-save" onClick={commitEdit}>{t("goal.update")}</button>
          <button type="button" className="ghost" onClick={() => { setEditing(false); setEditText(goal.objective); }}>
            {t("action.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
