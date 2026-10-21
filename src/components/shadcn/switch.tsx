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
        "tw:relative tw:inline-flex tw:h-[22px] tw:w-[38px] tw:shrink-0 tw:items-center tw:rounded-full tw:border tw:border-input tw:bg-background tw:p-0 tw:align-middle tw:transition-[background-color,border-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:border-[var(--switch-on-track)] tw:data-checked:bg-[var(--switch-on-track)] tw:focus-visible:outline tw:focus-visible:outline-[length:var(--focus-ring-width)] tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-[var(--focus-ring-offset)] tw:disabled:pointer-events-none tw:disabled:opacity-[var(--disabled-opacity)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="tw:absolute tw:left-0.5 tw:size-4 tw:rounded-full tw:bg-[var(--switch-off-thumb)] tw:transition-[transform,background-color] tw:duration-[var(--motion-standard)] tw:ease-[var(--ease-out)] tw:data-checked:translate-x-4 tw:data-checked:bg-[var(--switch-on-thumb)]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
