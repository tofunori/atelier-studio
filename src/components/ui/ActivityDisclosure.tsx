import type { ReactNode } from "react";
import { Tick, ToolGlyph, type ActivityIcon } from "../chat/toolPresentation";
import { cx } from "./internal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";

export function ActivityDisclosure({ open, onToggle, label, meta, icon, status = "completed", children, summary = false }:
  { open: boolean; onToggle: () => void; label: ReactNode; meta?: ReactNode; icon?: ActivityIcon;
    status?: "running" | "completed" | "failed"; children?: ReactNode; summary?: boolean }) {
  return (
    <Collapsible
      className={cx("ui-activity", `is-${status}`, summary && "is-summary")}
      open={open}
      onOpenChange={(nextOpen) => { if (nextOpen !== open) onToggle(); }}
    >
      <CollapsibleTrigger render={<button type="button" className={cx("ui-activity-trigger", icon && "has-icon")} />}>
        {icon && <span className="ui-activity-icon" data-activity-icon={icon.cat}><ToolGlyph icon={icon} /></span>}
        <span className="ui-activity-label">{label}</span>
        {meta && <span className="ui-activity-meta">{meta}</span>}
        <Tick open={open} />
      </CollapsibleTrigger>
      {children && <CollapsibleContent className="ui-activity-detail">{children}</CollapsibleContent>}
    </Collapsible>
  );
}
