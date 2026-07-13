import type { ReactNode } from "react";
import { Tick, ToolGlyph, type ToolCat } from "../chat/toolPresentation";
import { cx } from "./internal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../shadcn/collapsible";

export function ActivityDisclosure({ open, onToggle, label, meta, icon, status = "completed", children, summary = false }:
  { open: boolean; onToggle: () => void; label: ReactNode; meta?: ReactNode; icon?: ToolCat;
    status?: "running" | "completed" | "failed"; children?: ReactNode; summary?: boolean }) {
  return (
    <Collapsible
      className={cx("ui-activity", `is-${status}`, summary && "is-summary")}
      open={open}
      onOpenChange={(nextOpen) => { if (nextOpen !== open) onToggle(); }}
    >
      <CollapsibleTrigger render={<button type="button" className="ui-activity-trigger" />}>
        {!summary && <span className="ui-activity-status" aria-hidden="true" />}
        {icon && <span className="ui-activity-icon"><ToolGlyph cat={icon} /></span>}
        <span className="ui-activity-label">{label}</span>
        {meta && <span className="ui-activity-meta">{meta}</span>}
        <Tick open={open} />
      </CollapsibleTrigger>
      {children && <CollapsibleContent className="ui-activity-detail">{children}</CollapsibleContent>}
    </Collapsible>
  );
}
