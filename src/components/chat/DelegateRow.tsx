import { RowButton } from "../ui/RowButton";
import { t } from "../../lib/i18n";
import type { DelegatedState } from "../../lib/threadLinks";
import { fmtClock } from "./clock";
import { LiveClock } from "./LiveClock";
import { Tick, ToolStateGlyph } from "./toolPresentation";

/** « needs-you » : une carte du spécialiste attend ton clic (Lancer). */
export type DelegateRowState = DelegatedState | "needs-you";

function label(state: DelegateRowState, reports: number): string {
  switch (state) {
    case "running": return t("delegate.running");
    case "queued": return t("delegate.queued");
    case "waiting": return t("delegate.waiting");
    case "needs-you": return t("delegate.needs-you");
    default: return reports > 1 ? t("delegate.done-many", { count: reports }) : t("delegate.done");
  }
}

/** Un spécialiste (ou un fil de travail) dans le fil principal : une rangée
 *  signée — initiale, nom, ce qu'il fait, et la tâche dite en mots dessous.
 *  Son texte reste dans son fil, ouvert d'un clic ; c'est le coordinateur
 *  qui résume. Variante A « Signature », choisie le 2026-11-16. */
export function DelegateRow({ name, task, state, reports = 0, since, durationMs, onOpen }: {
  /** Nom court, sans « @ ». */
  name: string;
  task?: string;
  state: DelegateRowState;
  reports?: number;
  /** Début du travail en cours (horloge vivante). */
  since?: number | null;
  /** Durée d'un travail terminé, si connue. */
  durationMs?: number | null;
  onOpen?: () => void;
}) {
  const what = label(state, reports);
  const running = state === "running";
  const initial = (name.trim()[0] ?? "·").toLocaleUpperCase();
  const time = running && since != null
    ? <LiveClock since={since} className="delegate-row-time" />
    : !running && durationMs != null && durationMs >= 1000
      ? <span className="delegate-row-time">{fmtClock(durationMs)}</span>
      : null;
  return (
    <div className="delegate-row" data-state={state}>
      <RowButton
        className="delegate-row-head"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={onOpen ? `${name} ${what}${task ? ` · ${task}` : ""} — ${t("delegate.open", { name })}` : undefined}
      >
        <span className="delegate-row-avatar" aria-hidden="true">{initial}</span>
        <span className="delegate-row-line">
          <span className="delegate-row-name">{name}</span>
          <span className="delegate-row-state">
            {state === "needs-you" ? <span className="delegate-row-dot" aria-hidden="true" /> : null}
            {running ? <ToolStateGlyph outcome="running" /> : null}
            {what}
          </span>
        </span>
        <span className="delegate-row-side">
          {time}
          {onOpen ? <Tick /> : null}
        </span>
        {task ? <span className="delegate-row-task">{task}</span> : null}
      </RowButton>
    </div>
  );
}
