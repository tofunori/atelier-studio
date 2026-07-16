import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  "aria-label": ariaLabel = "Value",
  ...props
}: {
  className?: string
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  "aria-label"?: string
  disabled?: boolean
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={(next) => onValueChange(next)}
      className={cn("tw:w-[170px] tw:select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control className="tw:flex tw:w-full tw:touch-none tw:items-center tw:py-2">
        <SliderPrimitive.Track className="tw:relative tw:h-1 tw:w-full tw:rounded-full tw:bg-muted">
          <SliderPrimitive.Indicator className="tw:absolute tw:h-full tw:rounded-full tw:bg-muted-foreground" />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            className="tw:block tw:size-3.5 tw:rounded-full tw:border tw:border-border tw:bg-foreground tw:outline-none tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
