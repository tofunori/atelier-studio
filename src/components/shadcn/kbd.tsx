import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "ui-kbd tw:pointer-events-none tw:inline-flex tw:w-fit tw:items-center tw:justify-center tw:gap-1 tw:select-none tw:[&_svg:not([class*=size-])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("tw:inline-flex tw:items-center tw:gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
