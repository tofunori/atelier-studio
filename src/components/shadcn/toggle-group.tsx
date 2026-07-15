import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleGroupItemVariants = cva(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-[var(--radius-surface)] tw:text-[var(--fs-body-s)] tw:text-muted-foreground tw:hover:bg-accent tw:hover:text-accent-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:data-pressed:bg-accent tw:data-pressed:text-accent-foreground tw:disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "tw:bg-transparent",
        outline: "tw:border tw:border-input tw:bg-background",
      },
      size: {
        default: "tw:h-8 tw:px-2.5",
        xs: "tw:h-6 tw:px-2 tw:text-[var(--fs-caption)]",
        sm: "tw:h-7 tw:px-2 tw:text-[var(--fs-caption)]",
        lg: "tw:h-9 tw:px-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function ToggleGroup<Value extends string>({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive<Value>>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", className)}
      {...props}
    />
  )
}

function ToggleGroupItem<Value extends string>({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive<Value>> &
  VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <TogglePrimitive
      type="button"
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
