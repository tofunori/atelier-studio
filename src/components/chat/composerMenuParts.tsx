import type { ReactNode } from "react";

import { ChevronRightIcon, StarIcon } from "lucide-react";
/** Pièces communes des menus du compositeur (variante C « panneau de
 *  réglages », choisie par Thierry le 2026-11-09) : un titre avec la valeur
 *  en vigueur à droite, un interrupteur pour ce qui s'allume ou s'éteint, un
 *  bouton radio pour un choix unique. Purement visuelles : l'état vient de la
 *  rangée (aria-checked) ou de la prop `on`. Styles : App.css, bloc « cm-* ». */
export function MenuTitle(p: { children: ReactNode; value?: ReactNode }) {
  return (
    <span className="cm-title">
      <span className="cm-title-text">{p.children}</span>
      {p.value != null && p.value !== "" && <span className="cm-title-val">{p.value}</span>}
    </span>
  );
}

/** Interrupteur d'une rangée à cocher : suit son aria-checked (CSS). */
export function MenuSwitch() {
  return <span className="cm-switch" aria-hidden="true"><i /></span>;
}

export function MenuRadio(p: { on: boolean }) {
  return <span className={p.on ? "cm-radio on" : "cm-radio"} aria-hidden="true" />;
}

export function MenuChevron() {
  return (
    <ChevronRightIcon size={12} className="cm-chev" />
  );
}

/** Étoile des favoris : trait fin, pleine quand le modèle est favori. */
export function MenuStar(p: { on: boolean }) {
  return (
    <StarIcon size={14} className="cm-star" fill={p.on ? "currentColor" : "none"} />
  );
}
