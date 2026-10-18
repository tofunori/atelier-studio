import type { ReactNode } from "react";
import { Tick, ToolGlyph, ToolStateGlyph, type ActivityIcon } from "../chat/toolPresentation";
import { cx } from "./internal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";

/** Même grille que les rangées d'outil du fil : icône · libellé · méta ·
 * état · chevron. Le chevron ferme TOUJOURS la rangée (jamais collé au
 * libellé) et l'état a sa colonne fixe : anneau pendant l'exécution, croix
 * sur un échec, vide une fois posé. `aside` vit sous le déclencheur, hors du
 * repli (traîne de sortie d'une commande en cours). */
export function ActivityDisclosure({ open, onToggle, label, meta, icon, status = "completed", children, summary = false, shimmer = false, aside }:
  { open: boolean; onToggle: () => void; label: ReactNode; meta?: ReactNode; icon?: ActivityIcon;
    status?: "running" | "completed" | "failed"; children?: ReactNode; summary?: boolean; shimmer?: boolean; aside?: ReactNode }) {
  return (
    <Collapsible
      className={cx("ui-activity", `is-${status}`, summary && "is-summary")}
      open={open}
      onOpenChange={(nextOpen) => { if (nextOpen !== open) onToggle(); }}
    >
      <CollapsibleTrigger render={<button type="button" className={cx("ui-activity-trigger", icon && "has-icon")} />}>
        {icon && <span className="ui-activity-icon" data-activity-icon={icon.cat}><ToolGlyph icon={icon} /></span>}
        <span className={cx("ui-activity-label", shimmer && status !== "failed" && "is-shimmering")}>{label}</span>
        <span className="ui-activity-meta">{meta}</span>
        <span className="ui-activity-state"><ToolStateGlyph outcome={status === "completed" ? "none" : status === "failed" ? "failed" : "running"} /></span>
        <Tick open={open} />
      </CollapsibleTrigger>
      {aside}
      {children && <CollapsibleContent className="ui-activity-detail">{children}</CollapsibleContent>}
    </Collapsible>
  );
}
