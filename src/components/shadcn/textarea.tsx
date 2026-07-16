import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textareaVariants = cva(
  "tw:flex tw:min-h-20 tw:w-full tw:min-w-0 tw:resize-y tw:rounded-[var(--radius-control)] tw:border tw:px-2.5 tw:py-2 tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default:
          "tw:border-input tw:bg-background tw:focus-visible:border-[var(--border-strong)] tw:focus-visible:ring-1 tw:focus-visible:ring-[var(--border-strong)]",
        bare:
          "tw:rounded-none tw:border-transparent tw:bg-transparent tw:p-0 tw:focus-visible:border-transparent tw:focus-visible:ring-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea, textareaVariants }
