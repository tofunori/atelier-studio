// InspectorPanel (plan 016) — modèle commun du panneau inspecteur droit
// (décision 014) : SurfaceHeader sticky + corps scrollable + footer d'actions.
// Si onClose est fourni, closeLabel l'est aussi (imposé par le type — le
// bouton de fermeture a toujours un nom accessible, l'appelant passe t(...)).
import React from "react";
import { cx } from "./internal";
import { SurfaceHeader } from "./SurfaceHeader";
import { CloseButton } from "./CloseButton";

type ClosableProps =
  | { onClose: () => void; closeLabel: string }
  | { onClose?: undefined; closeLabel?: undefined };

export function InspectorPanel(
  props: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
  } & ClosableProps,
) {
  const { title, eyebrow, actions, footer, children, className, onClose, closeLabel } = props;
  return (
    <aside className={cx("ui-inspector", className)}>
      <SurfaceHeader
        title={title}
        eyebrow={eyebrow}
        actions={
          <>
            {actions}
            {onClose && (
              <CloseButton label={closeLabel} onClick={onClose} />
            )}
          </>
        }
      />
      <div className="ui-inspector-body">{children}</div>
      {footer != null && <div className="ui-inspector-footer">{footer}</div>}
    </aside>
  );
}
