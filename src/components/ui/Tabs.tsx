import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Children, isValidElement, useMemo, useState } from "react";
import {
  Tabs as ShadcnTabs,
  TabsContent as ShadcnTabsContent,
  TabsList as ShadcnTabsList,
  TabsTrigger as ShadcnTabsTrigger,
} from "../shadcn/tabs";
import { cx } from "./internal";

type TabChildProps = {
  active?: boolean;
  label?: string;
  value?: string;
  tabId?: string;
  children?: ReactNode;
};

type TabListProps = {
  children: ReactNode;
  className?: string;
  /** Valeur contrôlée du groupe. Les valeurs sont des identifiants métier stables. */
  value?: string;
  /** Notifie la sélection d'un onglet, y compris au clavier. */
  onValueChange?: (value: string) => void;
};

function tabValue(props: TabChildProps, index: number) {
  return props.value ?? props.tabId ?? props.label ?? `tab-${index + 1}`;
}

type ClassNameValue<State> = string | ((state: State) => string | undefined) | undefined;

function mergeClassName<State>(base: string, className: ClassNameValue<State>): ClassNameValue<State> {
  return typeof className === "function"
    ? (state) => cx(base, className(state))
    : cx(base, className);
}

function collectTabProps(children: ReactNode, result: Array<TabChildProps & { value: string }> = []): Array<TabChildProps & { value: string }> {
  let index = result.length;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as TabChildProps & { children?: ReactNode };
    if (typeof props.label === "string" || typeof props.tabId === "string" || typeof props.value === "string") {
      result.push({ ...props, value: tabValue(props, index++) });
    }
    if (props.children) {
      collectTabProps(props.children, result);
      index = result.length;
    }
  });
  return result;
}

/** Controlled Tabs root for richer panels that need the full Base UI contract. */
export function Tabs({ className, ...props }: ComponentProps<typeof ShadcnTabs>) {
  return <ShadcnTabs {...props} className={mergeClassName("ui-tabs-root", className)} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof ShadcnTabsList>) {
  return <ShadcnTabsList {...props} className={mergeClassName("ui-tabs-list", className)} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof ShadcnTabsTrigger>) {
  return <ShadcnTabsTrigger {...props} className={mergeClassName("ui-tabs-trigger", className)} />;
}

export function TabsContent({ className, ...props }: ComponentProps<typeof ShadcnTabsContent>) {
  return <ShadcnTabsContent {...props} className={mergeClassName("ui-tabs-content", className)} />;
}

/**
 * Compact tab strip used by the terminal and other chrome surfaces.
 *
 * `value`/`onValueChange` make the ownership of selection explicit. `active`
 * remains a legacy initial hint for uncontrolled callers; it never owns or
 * paints a second selection state.
 */
export function TabList({ children, className, value, onValueChange }: TabListProps) {
  const items = useMemo(() => collectTabProps(children), [children]);
  const initialValue = items.find((item) => item.active)?.value ?? items[0]?.value ?? "";
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const activeValue = value ?? uncontrolledValue;

  return (
    <Tabs
      value={activeValue}
      onValueChange={(next) => {
        if (value === undefined) setUncontrolledValue(next);
        onValueChange?.(next);
      }}
      className={cx("ui-tabs", className)}
    >
      <TabsList className="tw:contents">{children}</TabsList>
    </Tabs>
  );
}

export type TabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> & {
  /** Legacy initial selection hint; group `value` remains the source of truth. */
  active?: boolean;
  icon?: ReactNode;
  label: string;
  /** Identifiant stable à utiliser comme valeur du groupe. */
  tabId?: string;
  value?: string;
  compact?: boolean;
  closeLabel?: string;
  closeIcon?: ReactNode;
  onClose?: () => void;
};

export function Tab({
  active,
  icon,
  label,
  tabId,
  value,
  compact,
  closeLabel,
  closeIcon,
  onClose,
  className,
  children,
  ...buttonProps
}: TabProps) {
  // Keep the legacy prop in the public type for callers that still pass it;
  // selection is owned by the Tabs root and Base UI's data-active state.
  void active;
  const stableValue = value ?? tabId ?? label;
  return (
    <TabsTrigger
      {...buttonProps}
      type="button"
      value={stableValue}
      aria-label={compact ? label : buttonProps["aria-label"]}
      className={cx("ui-tab", compact && "is-compact", className)}
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
