// InlineNotice (plan 016) — message contextuel dans le flux (info, succès,
// avertissement, erreur). Région vive : les erreurs interrompent (role=alert),
// le reste est annoncé poliment (role=status).
import React from "react";
import { cx } from "./internal";
import { Alert } from "../shadcn/alert";

export type NoticeTone = "info" | "success" | "warning" | "error";

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
      {children}
    </Alert>
  );
}
