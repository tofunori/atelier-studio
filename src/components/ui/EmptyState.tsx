// EmptyState (plan 016) — état vide sobre d'une surface (parité visuelle avec
// la .empty-card historique : carte min(360px,100%), actions empilées).
import React from "react";
import { cx } from "./internal";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../shadcn/empty";

export function EmptyState(props: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { title, description, actions, className } = props;
  return (
    <Empty className={cx("ui-empty", className)}>
      <EmptyHeader>
        <EmptyTitle className="title">{title}</EmptyTitle>
        {description != null && <EmptyDescription className="desc">{description}</EmptyDescription>}
      </EmptyHeader>
      {actions != null && <EmptyContent className="actions">{actions}</EmptyContent>}
    </Empty>
  );
}
