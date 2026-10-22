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
        "tw:inline-flex tw:size-4 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:p-0 tw:text-on-fill-primary tw:transition-[background-color,border-color,color] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:data-checked:border-fill-primary tw:data-checked:bg-fill-primary tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)] tw:disabled:pointer-events-none tw:disabled:opacity-[var(--disabled-opacity)]",
        className,
      )}
      {...props}
    />
  )
}

// Coche par défaut (PRIM-23) : UNE coche SVG de 10 px au trait 1,5, et un
// tiret pour l'état partiel (Root indeterminate) — plus de caractères ✓ / −.
function CheckboxIndicator({ className, children, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Indicator>) {
  return (
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className={cn("tw:flex tw:items-center tw:justify-center tw:data-unchecked:hidden", className)}
      {...props}
    >
      {children ?? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="ui-check-mark" d="M2 5.2l2 2 4-4.4" />
          <path className="ui-check-partial" d="M2.5 5h5" />
        </svg>
      )}
    </CheckboxPrimitive.Indicator>
  )
}

export { Checkbox, CheckboxIndicator }
