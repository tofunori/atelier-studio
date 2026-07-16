import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "tw:group/toggle tw:inline-flex tw:items-center tw:justify-center tw:gap-1 tw:rounded-[var(--radius-control)] tw:text-[var(--fs-body-s)] tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:hover:bg-muted tw:hover:text-foreground tw:focus-visible:outline tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-1 tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:aria-pressed:bg-muted tw:data-[state=on]:bg-muted tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "tw:bg-transparent",
        outline: "tw:border tw:border-input tw:bg-transparent tw:hover:bg-muted",
      },
      size: {
        default:
          "tw:h-8 tw:min-w-8 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        sm: "tw:h-7 tw:min-w-7 tw:px-2.5 tw:text-xs tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3.5",
        lg: "tw:h-9 tw:min-w-9 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
