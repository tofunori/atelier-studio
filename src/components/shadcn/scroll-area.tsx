import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("tw:relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="tw:size-full tw:rounded-[inherit] tw:transition-[color,box-shadow] tw:outline-none tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        // THIERRY-01 : même barre que partout (gallery/assets/scrollbars.css).
        "tw:flex tw:touch-none tw:select-none tw:data-horizontal:h-[var(--scrollbar-size)] tw:data-horizontal:flex-col tw:data-vertical:h-full tw:data-vertical:w-[var(--scrollbar-size)]",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="tw:relative tw:flex-1 tw:rounded-full tw:bg-[var(--scroll-thumb)] tw:hover:bg-[var(--scroll-thumb-hover)]"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
