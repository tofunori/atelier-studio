// IconButton (plan 016) — action iconique. `label` est OBLIGATOIRE (contrat
// a11y : tout bouton-icône a un nom accessible, imposé par le type). L'icône
// enfant est un SVG monochrome (stroke 1.3–1.5, currentColor) marqué
// aria-hidden par l'appelant ou décoratif par nature.
import React from "react";
import { Button as ShadcnButton } from "../shadcn/button";
import { cx } from "./internal";

export const IconButton = React.forwardRef<HTMLButtonElement, {
  /** Nom accessible (aria-label). Obligatoire. */
  label: string;
  children: React.ReactNode;
  size?: "s" | "m" | "l";
  /** Étend la cible interactive à 40×40 px (chrome dense — décision 014 §7). */
  hit40?: boolean;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Info-bulle native ; omis par défaut (utiliser <Tooltip> de préférence). */
  title?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-pressed"?: boolean;
}>((props, ref) => {
  const { label, size = "m", hit40, disabled, onClick, title, className, children } = props;
  const shadcnSize = size === "s" ? "icon-xs" : size === "l" ? "icon-lg" : "icon-sm";
  return (
    <ShadcnButton
      ref={ref}
      type="button"
      variant="ghost"
      size={shadcnSize}
      className={cx("ui-iconbtn", `ui-iconbtn--${size}`, hit40 && "ui-iconbtn--hit40", className)}
      aria-label={label}
      aria-describedby={props["aria-describedby"]}
      aria-expanded={props["aria-expanded"]}
      aria-haspopup={props["aria-haspopup"]}
      aria-pressed={props["aria-pressed"]}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ShadcnButton>
  );
});
IconButton.displayName = "IconButton";
