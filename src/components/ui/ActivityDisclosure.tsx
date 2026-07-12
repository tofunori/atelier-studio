import type { ReactNode } from "react";
import { Tick, ToolGlyph, type ToolCat } from "../chat/toolPresentation";
import { cx } from "./internal";

export function ActivityDisclosure({ open, onToggle, label, meta, icon, status = "completed", children, summary = false }:
  { open: boolean; onToggle: () => void; label: ReactNode; meta?: ReactNode; icon?: ToolCat;
    status?: "running" | "completed" | "failed"; children?: ReactNode; summary?: boolean }) {
  return (
    <div className={cx("ui-activity", `is-${status}`, summary && "is-summary")}>
      <button type="button" className="ui-activity-trigger" aria-expanded={open} onClick={onToggle}>
        {!summary && <span className="ui-activity-status" aria-hidden="true" />}
        {icon && <span className="ui-activity-icon"><ToolGlyph cat={icon} /></span>}
        <span className="ui-activity-label">{label}</span>
        {meta && <span className="ui-activity-meta">{meta}</span>}
        <Tick open={open} />
      </button>
      {open && children && <div className="ui-activity-detail">{children}</div>}
    </div>
  );
}
