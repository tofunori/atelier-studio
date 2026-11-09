import type { ReactNode } from "react";

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
    <svg className="cm-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

/** Étoile des favoris : trait fin, pleine quand le modèle est favori. */
export function MenuStar(p: { on: boolean }) {
  return (
    <svg className="cm-star" viewBox="0 0 16 16" fill={p.on ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.2l1.75 3.6 3.95.55-2.87 2.77.7 3.93L8 11.2l-3.53 1.85.7-3.93L2.3 6.35l3.95-.55z" />
    </svg>
  );
}
