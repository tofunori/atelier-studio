// InlineNotice (plan 016) — message contextuel dans le flux (info, succès,
// avertissement, erreur). Région vive : les erreurs interrompent (role=alert),
// le reste est annoncé poliment (role=status).
// Le ton se lit à l'icône ET à la teinte du fond, jamais à la seule couleur
// d'un filet (PRIM-12 / TRANS-27, WCAG 1.4.1) : icône 14 px au trait dans la
// couleur du statut, fond teinté à 8 %, aucune bordure.
import React from "react";
import { cx } from "./internal";
import { Alert } from "../shadcn/alert";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE_PATHS: Record<NoticeTone, React.ReactNode> = {
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.2v3.6M8 5.2v.1" /></>,
  success: <><circle cx="8" cy="8" r="6" /><path d="M5.4 8.2l1.8 1.8 3.4-3.6" /></>,
  warning: <><path d="M8 2.5l5.8 10.2H2.2z" /><path d="M8 6.5v3M8 11.2v.1" /></>,
  error: <><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></>,
};

export function InlineNotice(props: {
  children: React.ReactNode;
  tone?: NoticeTone;
  className?: string;
}) {
  const { children, tone = "info", className } = props;
  return (
    <Alert
      role={tone === "error" ? "alert" : "status"}
      variant={tone === "error" ? "destructive" : "default"}
      className={cx("ui-notice", `ui-notice--${tone}`, className)}
    >
      <svg className="ui-notice-icon" width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {TONE_PATHS[tone]}
      </svg>
      <div className="ui-notice-body">{children}</div>
    </Alert>
  );
}
