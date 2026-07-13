import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Children, isValidElement, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "../shadcn/tabs";
import { cx } from "./internal";

type TabChildProps = { active?: boolean; label?: string };

function collectTabProps(children: ReactNode, result: TabChildProps[] = []): TabChildProps[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as TabChildProps & { children?: ReactNode };
    if (typeof props.label === "string") result.push(props);
    if (props.children) collectTabProps(props.children, result);
  });
  return result;
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  const activeValue = useMemo(() => {
    const items = collectTabProps(children);
    const active = items.find((item) => item.active);
    return active?.label
      ?? items[0]?.label
      ?? "";
  }, [children]);

  return (
    <Tabs value={activeValue} onValueChange={() => {}} className={cx("ui-tabs", className)}>
      <TabsList className="tw:contents">{children}</TabsList>
    </Tabs>
  );
}

export function Tab({
  active,
  icon,
  label,
  compact,
  closeLabel,
  closeIcon,
  onClose,
  className,
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: ReactNode;
  label: string;
  compact?: boolean;
  closeLabel?: string;
  closeIcon?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <TabsTrigger
      {...buttonProps}
      type="button"
      value={label}
      aria-label={compact ? label : buttonProps["aria-label"]}
      className={cx("ui-tab", active && "is-active", compact && "is-compact", className)}
    >
      {icon && <span className="ui-tab-icon" aria-hidden="true">{icon}</span>}
      {!compact && <span className="ui-tab-label">{children ?? label}</span>}
      {onClose && !compact && (
        <span
          role="button"
          aria-label={closeLabel}
          className="ui-tab-close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          {closeIcon ?? "×"}
        </span>
      )}
    </TabsTrigger>
  );
}
