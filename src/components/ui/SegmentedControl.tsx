// SegmentedControl (plan 016) — choix exclusif compact (pilote : sélecteur de
// layout Chat/Split/Atelier de la TopBar). Sémantique radiogroup : un seul
// arrêt de tabulation (roving tabindex), flèches = déplacement + sélection,
// chaque option a un nom accessible.
import React, { useRef } from "react";
import { ToggleGroup, ToggleGroupItem } from "../shadcn/toggle-group";
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
  const enabled = options.filter((option) => !option.disabled);

  const move = (direction: 1 | -1) => {
    if (!enabled.length) return;
    const currentIndex = enabled.findIndex((option) => option.value === value);
    const next = enabled[(currentIndex + direction + enabled.length) % enabled.length];
    onChange(next.value);
    const buttons = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-value]") ?? [],
    );
    buttons.find((button) => button.dataset.value === next.value)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    }
  };

  return (
    <ToggleGroup
      ref={groupRef}
      value={value ? [value] : []}
      onValueChange={(next) => {
        // A single-choice segment must never become empty. Base UI emits []
        // when the already-active item is clicked; preserve Atelier's public
        // contract by reporting the active value and letting the controlled
        // parent restore it.
        onChange(next[0] ?? value);
      }}
      role="radiogroup"
      aria-label={label}
      className={cx("ui-seg", className)}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            title={o.title}
            data-value={o.value}
            className={cx(checked && "on")}
            disabled={o.disabled}
          >
            {o.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
