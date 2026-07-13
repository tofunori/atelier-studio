// StatusBadge (plan 016) — pastille d'état compacte (point + libellé 10px
// majuscules). Statique par contrat Quiet Instrument : l'état « running »
// se distingue par la couleur accent, PAS par une animation.
import React from "react";
import { cx } from "./internal";
import { Badge } from "../shadcn/badge";

export type BadgeStatus = "neutral" | "running" | "success" | "warning" | "error";

export function StatusBadge(props: {
  children: React.ReactNode;
  status?: BadgeStatus;
  className?: string;
  title?: string;
}) {
  const { children, status = "neutral", className, title } = props;
  return (
    <Badge
      variant="secondary"
      className={cx("ui-badge", status !== "neutral" && `ui-badge--${status}`, className)}
      title={title}
    >
      <span className="dot" aria-hidden="true" />
      {children}
    </Badge>
  );
}
