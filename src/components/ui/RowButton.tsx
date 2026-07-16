// RowButton (extension plan 016) — contrat minimal pour toute surface
// activable qui n'est PAS un bouton d'action : rangée de liste, cellule de
// grille, chip, vignette, swatch, déclencheur cloné (render-prop Base UI).
// Reset du chrome natif + focus ring du système (primitives.css) ; la
// géométrie et l'état visuel restent à la classe produit passée en className.
// Transmet ref et tous les attributs natifs (drag, role, aria-*, onMouseDown…)
// — c'est ce qui permet d'interdire tout <button> nu hors de ui/ et shadcn/.
import React from "react";
import { cx } from "./internal";

export const RowButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function RowButton({ type = "button", className, ...rest }, ref) {
  return <button {...rest} ref={ref} type={type} className={cx("ui-rowbtn", className)} />;
});
