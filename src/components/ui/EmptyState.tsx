// EmptyState (plan 016) — état vide sobre d'une surface (parité visuelle avec
// la .empty-card historique : carte min(360px,100%), actions empilées).
import React from "react";
import { cx } from "./internal";

export function EmptyState(props: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { title, description, actions, className } = props;
  return (
    <div className={cx("ui-empty", className)}>
      <div className="title">{title}</div>
      {description != null && <div className="desc">{description}</div>}
      {actions != null && <div className="actions">{actions}</div>}
    </div>
  );
}
