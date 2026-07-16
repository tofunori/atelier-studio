import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("tw:flex tw:flex-col", className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn("tw:flex tw:items-center", className)} {...props} />
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "tw:inline-flex tw:appearance-none tw:items-center tw:justify-center tw:gap-1 tw:rounded-[var(--radius-control)] tw:border-0 tw:bg-transparent tw:p-0 tw:text-[var(--fs-body-s)] tw:text-muted-foreground tw:outline-none tw:hover:bg-accent tw:hover:text-accent-foreground tw:data-active:bg-accent tw:data-active:text-accent-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("tw:flex-1", className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
