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
  className?: string;
};

export function SegmentedControl(props: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** Nom accessible du groupe. Obligatoire. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const { options, value, onChange, label, disabled = false, className } = props;
  const groupRef = useRef<HTMLDivElement | null>(null);
  const enabled = options.filter((option) => !option.disabled);

  // Base UI supplies the roving tabindex and pressed state, but its toggle
  // group deliberately does not select on arrow keys. Keep that fallback in
  // this one owner so keyboard selection follows the same public callback as
  // pointer selection; do not react when a future Base UI handler has already
  // consumed the event.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented || !enabled.length) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const currentIndex = enabled.findIndex((option) => option.value === value);
    const next = enabled[(currentIndex + direction + enabled.length) % enabled.length];
    onChange(next.value);
    const buttons = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-value]") ?? [],
    );
    buttons.find((button) => button.dataset.value === next.value)?.focus();
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
      disabled={disabled}
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
            aria-pressed={undefined}
            aria-label={o.ariaLabel}
            title={o.title}
            data-value={o.value}
            className={cx(checked && "on", o.className)}
            disabled={disabled || o.disabled}
          >
            {o.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
