import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      nativeButton
      render={<button type="button" />}
      data-slot="switch"
      className={cn(
        "tw:relative tw:inline-flex tw:h-[22px] tw:w-[38px] tw:shrink-0 tw:items-center tw:rounded-full tw:border tw:border-input tw:bg-background tw:p-0 tw:align-middle tw:transition-[background-color,border-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:border-primary tw:data-checked:bg-primary tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring tw:disabled:pointer-events-none tw:disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="tw:absolute tw:left-0.5 tw:size-4 tw:rounded-full tw:bg-muted-foreground tw:transition-[transform,background-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:translate-x-4 tw:data-checked:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
