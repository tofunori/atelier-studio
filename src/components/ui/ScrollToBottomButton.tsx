import type { ReactNode } from "react";
import { ArrowDownIcon } from "../icons";
import { Spinner } from "./Spinner";

export function ScrollToBottomButton({
  label,
  show,
  working = false,
  elapsed,
  onClick,
}: {
  label: string;
  show: boolean;
  working?: boolean;
  /** Chrono du tour en cours : remonté lire, on voit que ça travaille encore. */
  elapsed?: ReactNode;
  onClick: () => void;
}) {
  const withElapsed = working && elapsed != null;
  return (
    <button
      type="button"
      className={`ui-scroll-to-bottom${show ? " is-visible" : ""}${withElapsed ? " has-elapsed" : ""}`}
      data-active={show}
      title={label}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={show ? onClick : undefined}
    >
      {working ? (
        // le Spinner commun (GAP-19), pas trois points qui tournent en hélice
        <Spinner size={12} className="ui-scroll-working" aria-hidden="true" />
      ) : (
        <ArrowDownIcon />
      )}
      {withElapsed ? <span className="ui-scroll-elapsed">{elapsed}</span> : null}
    </button>
  );
}
