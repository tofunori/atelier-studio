import * as React from "react"
import { ChevronDown, Check } from "lucide-react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-8 tw:data-[size=sm]:h-7 tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-icon="select-chevron" aria-hidden="true">
        <ChevronDown />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  portalContainer,
  positionerClassName,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  portalContainer?: React.ComponentProps<typeof SelectPrimitive.Portal>["container"]
  positionerClassName?: string
}) {
  return (
    <SelectPrimitive.Portal container={portalContainer}>
      <SelectPrimitive.Positioner
        sideOffset={4}
        className={cn("tw:z-[var(--z-popover)]", positionerClassName)}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:outline-none",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List className="tw:flex tw:flex-col tw:gap-0.5">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("tw:px-2 tw:py-1.5 tw:text-[var(--fs-caption)] tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center" aria-hidden="true">
        <SelectPrimitive.ItemIndicator>
          <Check data-icon="select-check" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("tw:-mx-1 tw:my-1 tw:h-px tw:border-0 tw:bg-border", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
