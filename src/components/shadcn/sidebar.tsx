import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/shadcn/separator"

type SidebarContextValue = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.")
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = openProp ?? internalOpen
  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      const next = typeof value === "function" ? value(open) : value
      if (openProp === undefined) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange, open, openProp],
  )
  const toggleSidebar = React.useCallback(() => setOpen((value) => !value), [setOpen])
  const state: SidebarContextValue["state"] = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo(
    () => ({ state, open, setOpen, toggleSidebar }),
    [open, setOpen, state, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-state={state}
        style={
          {
            "--sidebar-width": "100%",
            "--sidebar-width-icon": "3rem",
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "tw:group/sidebar-wrapper tw:flex tw:h-full tw:min-h-0 tw:w-full",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "none",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { state } = useSidebar()
  return (
    <div
      data-slot="sidebar"
      data-sidebar="sidebar"
      data-state={state}
      data-side={side}
      data-variant={variant}
      data-collapsible={collapsible}
      className={cn(
        "tw:flex tw:h-full tw:min-h-0 tw:w-(--sidebar-width) tw:min-w-0 tw:flex-col tw:bg-sidebar tw:text-sidebar-foreground",
        collapsible === "none" && "tw:w-full",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("tw:flex tw:flex-col tw:gap-2 tw:p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("tw:flex tw:flex-col tw:gap-2 tw:p-2", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn("tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-0", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("tw:relative tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({ className, as: Component = "div", ...props }: React.ComponentProps<"div"> & {
  as?: "div" | "h2" | "h3" | "h4"
}) {
  return (
    <Component
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "tw:flex tw:h-8 tw:shrink-0 tw:items-center tw:rounded-[var(--radius-control)] tw:px-2 tw:text-[length:var(--fs-caption)] tw:font-medium tw:text-sidebar-foreground/70",
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("tw:w-full tw:text-[length:var(--fs-body-s)]", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-0", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("tw:group/menu-item tw:relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "tw:group/menu-button tw:flex tw:w-full tw:min-w-0 tw:items-center tw:gap-2 tw:overflow-hidden tw:rounded-[var(--radius-control)] tw:p-2 tw:text-left tw:text-[length:var(--fs-body-s)] tw:text-sidebar-foreground tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-sidebar-ring tw:hover:bg-sidebar-accent tw:hover:text-sidebar-accent-foreground tw:data-active:bg-sidebar-accent tw:data-active:text-sidebar-accent-foreground tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:[&>svg]:shrink-0 tw:[&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "",
        outline: "tw:border tw:border-sidebar-border tw:bg-background",
      },
      size: {
        default: "tw:min-h-8",
        sm: "tw:min-h-7 tw:text-[length:var(--fs-caption)]",
        lg: "tw:min-h-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & {
  isActive?: boolean
  variant?: VariantProps<typeof sidebarMenuButtonVariants>["variant"]
  size?: VariantProps<typeof sidebarMenuButtonVariants>["size"]
}>(({ className, isActive = false, variant, size, ...props }, ref) => (
  <button
    ref={ref}
    data-slot="sidebar-menu-button"
    data-sidebar="menu-button"
    data-active={isActive ? "true" : undefined}
    className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
    {...props}
  />
))
SidebarMenuButton.displayName = "SidebarMenuButton"

function SidebarMenuAction({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "tw:absolute tw:right-1 tw:top-1/2 tw:flex tw:size-6 tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:p-0 tw:text-sidebar-foreground tw:outline-none tw:hover:bg-sidebar-accent tw:hover:text-sidebar-accent-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-sidebar-ring",
        className,
      )}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("tw:mx-2 tw:w-auto tw:bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return <main data-slot="sidebar-inset" className={cn("tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:flex-col", className)} {...props} />
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
}
