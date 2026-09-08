// StatusBadge (plan 016) — pastille d'état compacte (point + libellé 10px
// majuscules). Statique par contrat Quiet Instrument : l'état « running »
// se distingue par la couleur accent, PAS par une animation.
import React from "react";
import { cx } from "./internal";
import { Badge } from "../shadcn/badge";

export type BadgeStatus = "neutral" | "running" | "success" | "warning" | "error";

export type StatusBadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
  children: React.ReactNode;
  status?: BadgeStatus;
};

export function StatusBadge(props: StatusBadgeProps) {
  const { children, status = "neutral", className, ...rest } = props;
  return (
    <Badge
      variant="secondary"
      className={cx("ui-badge", status !== "neutral" && `ui-badge--${status}`, className)}
      data-status={status}
      {...rest}
    >
      <span className="dot" aria-hidden="true" />
      {children}
    </Badge>
  );
}
