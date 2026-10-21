import * as React from "react"
import { Check } from "lucide-react"
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
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)] tw:disabled:cursor-default tw:disabled:opacity-[var(--disabled-opacity)] tw:data-[size=default]:h-[var(--control-height)] tw:data-[size=sm]:h-[var(--control-height-s)] tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  portalContainer,
  positionerClassName,
  side,
  align,
  alignItemWithTrigger,
  sideOffset = 4,
  alignOffset,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  portalContainer?: React.ComponentProps<typeof SelectPrimitive.Portal>["container"]
  positionerClassName?: string
  side?: React.ComponentProps<typeof SelectPrimitive.Positioner>["side"]
  align?: React.ComponentProps<typeof SelectPrimitive.Positioner>["align"]
  alignItemWithTrigger?: React.ComponentProps<typeof SelectPrimitive.Positioner>["alignItemWithTrigger"]
  sideOffset?: React.ComponentProps<typeof SelectPrimitive.Positioner>["sideOffset"]
  alignOffset?: React.ComponentProps<typeof SelectPrimitive.Positioner>["alignOffset"]
}) {
  return (
    <SelectPrimitive.Portal container={portalContainer}>
      <SelectPrimitive.Positioner
        side={side}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={cn("tw:z-[var(--z-popover)]", positionerClassName)}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:outline-none",
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
      className={cn("tw:px-2 tw:py-1.5 tw:text-[length:var(--fs-caption)] tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[length:var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-[var(--disabled-opacity)]",
        className,
      )}
      {...props}
    >
      <span className="tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center" aria-hidden="true">
        <SelectPrimitive.ItemIndicator>
          <Check data-icon="select-check" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText data-slot="select-item-text">{children}</SelectPrimitive.ItemText>
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
