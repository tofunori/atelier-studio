import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./internal";

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-tabs", className)} role="tablist">{children}</div>;
}

export function Tab({ active, icon, label, compact, closeLabel, closeIcon, onClose, className, children, ...buttonProps }:
  ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean; icon?: ReactNode; label: string; compact?: boolean;
    closeLabel?: string; closeIcon?: ReactNode; onClose?: () => void;
  }) {
  return (
    <button {...buttonProps} type="button" role="tab" aria-selected={active}
      aria-label={compact ? label : buttonProps["aria-label"]}
      className={cx("ui-tab", active && "is-active", compact && "is-compact", className)}>
      {icon && <span className="ui-tab-icon" aria-hidden="true">{icon}</span>}
      {!compact && <span className="ui-tab-label">{children ?? label}</span>}
      {onClose && !compact && (
        <span role="button" aria-label={closeLabel} className="ui-tab-close"
          onClick={(event) => { event.stopPropagation(); onClose(); }}>
          {closeIcon ?? "×"}
        </span>
      )}
    </button>
  );
}
