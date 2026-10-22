import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-transparent tw:bg-clip-padding tw:text-[length:var(--fs-body-s)] tw:text-foreground tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:select-none tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)] tw:active:not-aria-[haspopup]:scale-[0.98] tw:disabled:pointer-events-none tw:disabled:opacity-[var(--disabled-opacity)] tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-[var(--icon-m)]",
  {
    variants: {
      variant: {
        // Jamais d'encre en fond (« pas de blanc dans les boutons ») : le plein
        // et le secondaire passent par les jetons --fill-* de tokens.css.
        // A5 (PRIM-15) : un état « ouvert / activé » commun — menu déployé
        // (aria-expanded, data-popup-open de Base UI) ou bascule allumée
        // (aria-pressed) — et un survol jamais plus marqué que cet état.
        default: "tw:bg-fill-primary tw:text-on-fill-primary tw:hover:bg-fill-primary-hover tw:aria-expanded:bg-fill-primary-hover tw:data-[popup-open]:bg-fill-primary-hover tw:aria-pressed:bg-fill-primary-hover",
        outline:
          "tw:border-border tw:bg-background tw:hover:bg-[var(--surface-hover)] tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground tw:data-[popup-open]:bg-muted tw:data-[popup-open]:text-foreground tw:aria-pressed:bg-muted tw:aria-pressed:text-foreground",
        secondary:
          "tw:border-fill-secondary-ring tw:bg-fill-secondary tw:text-secondary-foreground tw:hover:bg-fill-secondary-hover tw:aria-expanded:bg-fill-secondary-hover tw:aria-expanded:text-secondary-foreground tw:data-[popup-open]:bg-fill-secondary-hover tw:data-[popup-open]:text-secondary-foreground tw:aria-pressed:bg-fill-secondary-hover tw:aria-pressed:text-secondary-foreground",
        ghost:
          "tw:bg-transparent tw:hover:bg-[var(--surface-hover)] tw:hover:text-foreground tw:aria-expanded:bg-muted tw:aria-expanded:text-foreground tw:data-[popup-open]:bg-muted tw:data-[popup-open]:text-foreground tw:aria-pressed:bg-muted tw:aria-pressed:text-foreground",
        destructive:
          "tw:bg-destructive/10 tw:text-destructive tw:hover:bg-destructive/20 tw:focus-visible:border-destructive/40",
        link: "tw:bg-transparent tw:text-primary tw:underline-offset-4 tw:hover:underline",
      },
      size: {
        default:
          "tw:h-[var(--control-height)] tw:gap-2 tw:px-3 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        xs: "tw:h-[var(--control-height-s)] tw:gap-1 tw:px-2 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-1.5 tw:has-data-[icon=inline-start]:pl-1.5 tw:[&_svg:not([class*=size-])]:size-[var(--icon-s)]",
        sm: "tw:h-[var(--control-height-m)] tw:gap-1 tw:px-2 tw:text-xs tw:in-data-[slot=button-group]:rounded-lg tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2 tw:[&_svg:not([class*=size-])]:size-[var(--icon-m)]",
        lg: "tw:h-[var(--control-height-l)] tw:gap-2 tw:px-3 tw:has-data-[icon=inline-end]:pr-2 tw:has-data-[icon=inline-start]:pl-2",
        icon: "tw:size-[var(--control-height)]",
        "icon-xs":
          "tw:size-[var(--control-height-s)] tw:in-data-[slot=button-group]:rounded-lg tw:[&_svg:not([class*=size-])]:size-[var(--icon-s)]",
        "icon-sm":
          "tw:size-[var(--control-height-m)] tw:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "tw:size-[var(--control-height-l)] tw:[&_svg:not([class*=size-])]:size-[var(--icon-l)]",
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
