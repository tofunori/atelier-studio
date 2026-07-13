import { useRef, type ComponentProps, type ReactNode } from "react";
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./shadcn/select";

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

/**
 * Product adapter for Atelier's existing select API.
 * The callsites keep their domain-friendly `options` shape while the
 * interaction, focus management and popup positioning come from Base UI.
 */
export function Select(p: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  compact?: boolean;
  title?: string;
  className?: string;
  portalContainer?: ComponentProps<typeof SelectContent>["portalContainer"] | null;
  positionerClassName?: string;
}) {
  const selected = p.options.find((option) => option.value === p.value);
  const items = p.options.map(({ value, label }) => ({ value, label }));
  const portalContainer = useRef<HTMLSpanElement>(null);

  return (
    <span ref={portalContainer} className={`custom-select ${p.compact ? "compact" : ""} ${p.className ?? ""}`} data-value={p.value}>
      <ShadcnSelect
        value={p.value}
        items={items}
        onValueChange={(value) => {
          if (typeof value === "string") p.onChange(value);
        }}
      >
      <SelectTrigger
        size={p.compact ? "sm" : "default"}
        title={p.title}
        aria-label={p.title}
        className={`custom-select-trigger ${p.compact ? "compact" : ""}`}
      >
        <SelectValue>
          {() => (
            <span className="custom-select-label tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:truncate">
              {selected?.icon && <span className="custom-select-icon">{selected.icon}</span>}
              <span>{selected?.label ?? p.value}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className="custom-select-menu"
        portalContainer={p.portalContainer === null ? undefined : p.portalContainer ?? portalContainer}
        positionerClassName={p.positionerClassName}
      >
        <SelectGroup>
          {p.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
              className={`custom-select-option ${option.icon ? "has-icon" : ""}`}
            >
              {option.icon && <span className="custom-select-option-icon">{option.icon}</span>}
              <span className="custom-select-option-label">{option.label}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
      </ShadcnSelect>
    </span>
  );
}
