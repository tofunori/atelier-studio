import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-transparent tw:bg-clip-padding tw:text-[var(--fs-body-s)] tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:select-none tw:focus-visible:outline tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-1 tw:active:not-aria-[haspopup]:scale-[0.98] tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:hover:bg-primary/80",
        outline:
          "tw:border-border tw:bg-background tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        secondary:
          "tw:bg-secondary tw:text-secondary-foreground tw:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] tw:aria-expanded:bg-secondary tw:aria-expanded:text-secondary-foreground",
        ghost:
          "tw:bg-transparent tw:hover:bg-muted tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground",
        destructive:
          "tw:bg-destructive/10 tw:text-destructive tw:hover:bg-destructive/20 tw:focus-visible:border-destructive/40",
        link: "tw:bg-transparent tw:text-primary tw:underline-offset-4 tw:hover:underline",
      },
      size: {
        default:
          "tw:h-8 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        xs: "tw:h-6 tw:gap-1 tw:rounded-[min(var(--radius-md),10px)] tw:px-2 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3",
        sm: "tw:h-7 tw:gap-1 tw:rounded-[min(var(--radius-md),12px)] tw:px-2.5 tw:text-[0.8rem] tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-3.5",
        lg: "tw:h-9 tw:gap-1.5 tw:px-2.5 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        icon: "tw:size-8",
        "icon-xs":
          "tw:size-6 tw:rounded-[min(var(--radius-md),10px)] tw:in-data-[slot=button-group]:rounded-lg tw:[&_svg:not([class*=size-])]:size-3",
        "icon-sm":
          "tw:size-7 tw:rounded-[min(var(--radius-md),12px)] tw:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "tw:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
