import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      nativeButton
      render={<button type="button" />}
      data-slot="checkbox"
      className={cn(
        "tw:inline-flex tw:size-4 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:p-0 tw:text-primary-foreground tw:transition-[background-color,border-color,color] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:data-checked:border-primary tw:data-checked:bg-primary tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring tw:disabled:pointer-events-none tw:disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function CheckboxIndicator({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Indicator>) {
  return (
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className={cn("tw:flex tw:items-center tw:justify-center tw:data-unchecked:hidden", className)}
      {...props}
    />
  )
}

export { Checkbox, CheckboxIndicator }
