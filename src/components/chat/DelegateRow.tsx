import { RowButton } from "../ui/RowButton";
import { t } from "../../lib/i18n";
import type { DelegatedState } from "../../lib/threadLinks";
import { fmtClock } from "./clock";
import { LiveClock } from "./LiveClock";
import { Tick, ToolGlyph, ToolStateGlyph } from "./toolPresentation";

const LABEL_KEYS = {
  running: "delegate.running",
  queued: "delegate.queued",
  waiting: "delegate.waiting",
  review: "delegate.done",
  done: "delegate.done",
} as const satisfies Record<DelegatedState, string>;

/** Un spécialiste (ou un fil de travail) dans le fil principal : une rangée
 *  calme, comme un outil — ce qu'il fait pendant, « a rendu son rapport »
 *  ensuite. Son texte reste dans son fil, ouvert d'un clic ; c'est le
 *  coordinateur qui résume (variante B « une seule voix », 2026-11-16). */
export function DelegateRow({ name, task, state, since, durationMs, onOpen }: {
  name: string;
  task?: string;
  state: DelegatedState;
  /** Début du travail en cours (horloge vivante). */
  since?: number | null;
  /** Durée d'un travail terminé, si connue. */
  durationMs?: number | null;
  onOpen?: () => void;
}) {
  const label = t(LABEL_KEYS[state], { name });
  const running = state === "running";
  const quiet = state === "waiting";
  return (
    <div
      className={`tool-output is-compact delegate-row${running ? "" : " is-done"}${quiet ? " is-soft" : ""}`}
      data-state={state}
    >
      <RowButton
        className="tool-output-head"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={onOpen ? `${label}${task ? ` · ${task}` : ""} — ${t("delegate.open", { name })}` : undefined}
      >
        <span className="tool-output-icon" data-activity-icon="agent">
          <ToolGlyph icon={{ cat: "agent" }} />
        </span>
        <span className="tool-output-name">
          {label}
          {task ? <span className="delegate-row-task">{task}</span> : null}
        </span>
        <span className="tool-status">{running ? <ToolStateGlyph outcome="running" /> : null}</span>
        {running && since != null
          ? <LiveClock since={since} className="tool-duration" />
          : <span className="tool-duration">{!running && durationMs != null && durationMs >= 1000 ? fmtClock(durationMs) : null}</span>}
        {onOpen ? <Tick /> : null}
      </RowButton>
    </div>
  );
}
