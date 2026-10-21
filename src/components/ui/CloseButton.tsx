// CloseButton (A5, PRIM-11) — LA croix de fermeture d'Atelier. Un seul dessin
// (X SVG sur une grille de 16, trait 1,4, currentColor), une seule taille
// (IconButton s, 24 px), une seule couleur (--text-muted au repos,
// --text-primary au survol, via .ui-iconbtn). Dialogues, tiroirs, inspecteur,
// puces, onglets, popover d'usage et toasts l'utilisent.
// Placement dans un panneau : décalage = padding du panneau − (24 − 16) / 2,
// soit 12 px dans un panneau de 16 px — l'icône s'aligne sur le contenu.
import React from "react";
import { t } from "../../lib/i18n";
import { IconButton } from "./IconButton";
import { cx } from "./internal";

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" className="ui-close-icon">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

type IconButtonProps = React.ComponentProps<typeof IconButton>;

export const CloseButton = React.forwardRef<HTMLButtonElement,
  Omit<IconButtonProps, "children" | "label" | "size"> & { label?: string }>((props, ref) => {
  const { label, className, ...rest } = props;
  return (
    <IconButton {...rest} ref={ref} size="s" label={label ?? t("action.close")} className={cx("ui-close", className)}>
      <CloseIcon />
    </IconButton>
  );
});
CloseButton.displayName = "CloseButton";
