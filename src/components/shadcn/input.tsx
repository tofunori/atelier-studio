import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "tw:h-[var(--control-height)] tw:w-full tw:min-w-0 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:px-2 tw:py-1 tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)] tw:disabled:pointer-events-none tw:disabled:cursor-default tw:disabled:opacity-[var(--disabled-opacity)] tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
