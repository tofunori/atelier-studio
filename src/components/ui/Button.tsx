// Button (plan 016) — action textuelle. Quatre variantes, loading sans layout
// shift (le label garde sa géométrie, le spinner se superpose), disabled
// réellement inerte (attribut natif).
import React from "react";
import { Button as ShadcnButton } from "../shadcn/button";
import { Spinner } from "../shadcn/spinner";
import { cx } from "./internal";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = Omit<React.ComponentProps<typeof ShadcnButton>, "variant" | "className" | "children"> & {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const {
    variant = "secondary",
    type = "button",
    disabled,
    loading,
    className,
    children,
    ...rest
  } = props;
  const shadcnVariant = variant === "primary" ? "default" : variant === "danger" ? "destructive" : variant;
  return (
    <ShadcnButton
      {...rest}
      ref={ref}
      type={type}
      variant={shadcnVariant}
      className={cx("ui-btn", `ui-btn--${variant}`, loading && "ui-btn--loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className="ui-btn-label">{children}</span>
      {loading && (
        <span className="ui-btn-spin" aria-hidden="true">
          <Spinner className="ui-spin" aria-hidden="true" />
        </span>
      )}
    </ShadcnButton>
  );
});
