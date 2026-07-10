// Tooltip (plan 016) — contrat motion approuvé (014) : apparition après
// TOOLTIP_DELAY_MS (token --tooltip-delay = 420 ms), fondu 120 ms, disparition
// immédiate. Jamais de piège de focus ; Escape masque. L'enfant reçoit
// aria-describedby quand la bulle est visible.
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, useOverlayPosition, type Placement } from "./internal";

/** Miroir TS du token CSS --tooltip-delay (tokens.css). */
export const TOOLTIP_DELAY_MS = 420;

export function Tooltip(props: {
  /** Texte de la bulle. */
  label: string;
  /** Élément déclencheur unique (bouton, chip…). */
  children: React.ReactElement;
  placement?: Placement;
}) {
  const { label, children, placement = "top" } = props;
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const scheduleShow = () => {
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setOpen(true);
    }, TOOLTIP_DELAY_MS);
  };
  const hide = () => {
    cancel();
    setOpen(false);
  };

  // démontage : aucun timer orphelin, aucune bulle fantôme
  useEffect(() => cancel, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useOverlayPosition(open, wrapRef, panelRef, placement);

  return (
    <>
      <span
        ref={wrapRef}
        className="ui-tooltip-wrap"
        onMouseEnter={scheduleShow}
        onMouseLeave={hide}
        onFocus={scheduleShow}
        onBlur={hide}
        onMouseDown={hide}
      >
        {React.cloneElement(children, { "aria-describedby": open ? id : undefined } as Record<string, unknown>)}
      </span>
      {open &&
        createPortal(
          <div ref={panelRef} id={id} role="tooltip" className={cx("ui-tooltip", "open")}>
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
