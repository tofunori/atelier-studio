// Popover (plan 016) — surface temporaire ancrée à contenu libre (formulaires
// d'effort, permissions…). role=dialog non modal ; à l'ouverture le focus va
// au panneau (tabIndex -1) puis Tab circule naturellement dedans ; Escape
// ferme et rend le focus à l'ancre ; clic extérieur ferme.
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx, useDismiss, useOverlayPosition, type Placement } from "./internal";

export function Popover(props: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  placement?: Placement;
  /** Nom accessible du panneau. */
  label?: string;
  className?: string;
}) {
  const { open, onClose, anchorRef, children, placement = "bottom-start", label, className } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useOverlayPosition(open, anchorRef, panelRef, placement);
  useDismiss(open, onClose, panelRef, anchorRef);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className={cx("ui-popover", "open", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
