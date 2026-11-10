// InlineNotice (plan 016) — message contextuel dans le flux (info, succès,
// avertissement, erreur). Région vive : les erreurs interrompent (role=alert),
// le reste est annoncé poliment (role=status).
// Le ton se lit à l'icône ET à la teinte du fond, jamais à la seule couleur
// d'un filet (PRIM-12 / TRANS-27, WCAG 1.4.1) : icône 14 px au trait dans la
// couleur du statut, fond teinté à 8 %, aucune bordure.
import React from "react";
import { CircleCheckIcon, CircleXIcon, InfoIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { cx } from "./internal";
import { Alert } from "../shadcn/alert";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE_ICONS: Record<NoticeTone, LucideIcon> = {
  info: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, error: CircleXIcon,
};

export function InlineNotice(props: {
  children: React.ReactNode;
  tone?: NoticeTone;
  className?: string;
}) {
  const { children, tone = "info", className } = props;
  const ToneIcon = TONE_ICONS[tone];
  return (
    <Alert
      role={tone === "error" ? "alert" : "status"}
      variant={tone === "error" ? "destructive" : "default"}
      className={cx("ui-notice", `ui-notice--${tone}`, className)}
    >
      <ToneIcon className="ui-notice-icon" size={14} />
      <div className="ui-notice-body">{children}</div>
    </Alert>
  );
}
