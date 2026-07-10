// SurfaceHeader (plan 016) — en-tête commun des panneaux/surfaces :
// eyebrow (méta 10px majuscules) + titre (15px/600, ellipsé) + actions à
// droite. Purement structurel : aucune logique.
import React from "react";
import { cx } from "./internal";

export function SurfaceHeader(props: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { title, eyebrow, actions, className } = props;
  return (
    <header className={cx("ui-surface-header", className)}>
      <div className="titles">
        {eyebrow != null && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="title">{title}</h2>
      </div>
      <div className="spacer" />
      {actions != null && <div className="actions">{actions}</div>}
    </header>
  );
}
