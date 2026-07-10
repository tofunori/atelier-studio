// SegmentedControl (plan 016) — choix exclusif compact (pilote : sélecteur de
// layout Chat/Split/Atelier de la TopBar). Sémantique radiogroup : un seul
// arrêt de tabulation (roving tabindex), flèches = déplacement + sélection,
// chaque option a un nom accessible.
import React, { useRef } from "react";
import { cx } from "./internal";

export type SegmentedOption = {
  value: string;
  /** Contenu visuel (icône SVG monochrome ou texte court). */
  label: React.ReactNode;
  /** Nom accessible — OBLIGATOIRE si `label` n'est pas du texte. */
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
};

export function SegmentedControl(props: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** Nom accessible du groupe. Obligatoire. */
  label: string;
  className?: string;
}) {
  const { options, value, onChange, label, className } = props;
  const groupRef = useRef<HTMLDivElement | null>(null);

  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    if (!enabled.length) return;
    const cur = enabled.findIndex((o) => o.value === value);
    const next = enabled[(cur + dir + enabled.length) % enabled.length];
    onChange(next.value);
    // focus suit la sélection (roving tabindex)
    const buttons = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-value]") ?? []);
    buttons.find((b) => b.dataset.value === next.value)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    }
  };

  // l'option cochée porte tabIndex 0 ; si la valeur est inconnue, la première
  // option activable reste atteignable au clavier
  const tabStop = options.some((o) => o.value === value && !o.disabled)
    ? value
    : enabled[0]?.value;

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className={cx("ui-seg", className)} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            title={o.title}
            data-value={o.value}
            className={cx(checked && "on")}
            tabIndex={o.value === tabStop ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
