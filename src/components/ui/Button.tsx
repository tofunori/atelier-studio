// Button (plan 016) — action textuelle. Quatre variantes, loading sans layout
// shift (le label garde sa géométrie, le spinner se superpose), disabled
// réellement inerte (attribut natif).
import React from "react";
import { cx } from "./internal";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button(props: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const { variant = "secondary", type = "button", disabled, loading, onClick, title, className, children } = props;
  return (
    <button
      type={type}
      className={cx("ui-btn", `ui-btn--${variant}`, loading && "ui-btn--loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"]}
      aria-describedby={props["aria-describedby"]}
      title={title}
      onClick={onClick}
    >
      <span className="ui-btn-label">{children}</span>
      {loading && (
        <span className="ui-btn-spin" aria-hidden="true">
          <span className="ui-spin" />
        </span>
      )}
    </button>
  );
}
