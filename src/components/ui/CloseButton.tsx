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

import { XIcon } from "lucide-react";
export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <XIcon size={size} className="ui-close-icon" />
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
