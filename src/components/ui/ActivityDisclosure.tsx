import type { ReactNode } from "react";
import { Tick, ToolGlyph, ToolStateGlyph, type ActivityIcon } from "../chat/toolPresentation";
import { cx } from "./internal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";

type ActivityStatus = "running" | "completed" | "failed";

function activityOutcome(status: ActivityStatus, sweeping: boolean, setback: string | undefined) {
  if (status === "failed") return "failed" as const;
  if (status === "running") return sweeping ? "none" as const : "running" as const;
  return setback ? "setback" as const : "none" as const;
}

/** Même grille que les rangées d'outil du fil : icône · libellé · état ·
 * durée, la durée calée au bord droit. Le chevron n'a pas de colonne : avec
 * une icône de tête, il prend sa place au survol et à l'ouverture. État :
 * anneau qui tourne pendant l'exécution, point rouge si un échec a arrêté le
 * travail, petit anneau gris (`setback`, son infobulle) si des appels sans
 * succès ont été rattrapés ; vide une fois posé — et vide aussi quand le
 * libellé balaie (`shimmer`) : le reflet dit déjà que ça tourne. `aside` vit
 * sous le déclencheur, hors du repli (traîne de sortie d'une commande). */
export function ActivityDisclosure({ open, onToggle, label, meta, icon, status = "completed", children, summary = false, shimmer = false, aside, setback }:
  { open: boolean; onToggle: () => void; label: ReactNode; meta?: ReactNode; icon?: ActivityIcon;
    status?: ActivityStatus; children?: ReactNode; summary?: boolean; shimmer?: boolean; aside?: ReactNode;
    setback?: string }) {
  const sweeping = shimmer && status === "running";
  const outcome = activityOutcome(status, sweeping, setback);
  const hint = outcome === "setback" ? setback : undefined;
  return (
    <Collapsible
      className={cx("ui-activity", `is-${status}`, summary && "is-summary")}
      open={open}
      onOpenChange={(nextOpen) => { if (nextOpen !== open) onToggle(); }}
    >
      <CollapsibleTrigger render={<button type="button" className={cx("ui-activity-trigger", icon && "has-icon")} />}>
        {icon && <span className="ui-activity-icon" data-activity-icon={icon.cat}><ToolGlyph icon={icon} /></span>}
        <span className={cx("ui-activity-label", sweeping && "is-shimmering")}>{label}</span>
        <span className="ui-activity-meta">{meta}</span>
        <span className="ui-activity-state" title={hint} aria-label={hint}><ToolStateGlyph outcome={outcome} /></span>
        <Tick open={open} />
      </CollapsibleTrigger>
      {aside}
      {children && <CollapsibleContent className="ui-activity-detail">{children}</CollapsibleContent>}
    </Collapsible>
  );
}
