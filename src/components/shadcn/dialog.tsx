import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props) {
  return (
    <DialogPrimitive.Viewport
      data-slot="dialog-viewport"
      className={cn(
        "tw:fixed tw:inset-0 tw:z-[var(--z-modal)] tw:flex tw:items-center tw:justify-center tw:overflow-hidden tw:p-6",
        className
      )}
      {...props}
    />
  )
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "tw:fixed tw:inset-0 tw:isolate tw:z-[var(--z-modal)] tw:bg-[var(--scrim)] tw:duration-[var(--motion-fast)] tw:supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  overlayClassName,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  closeLabel?: React.ReactNode
  overlayClassName?: string
}) {
    return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogViewport>
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "tw:relative tw:grid tw:max-h-full tw:min-h-0 tw:w-full tw:max-w-[calc(100%-2rem)] tw:gap-4 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-4 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:ring-1 tw:ring-foreground/10 tw:duration-[var(--motion-fast)] tw:outline-none tw:sm:max-w-sm",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="tw:absolute tw:top-2 tw:right-2"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="tw:sr-only">{closeLabel}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("tw:flex tw:flex-col tw:gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "tw:-mx-4 tw:-mb-4 tw:flex tw:flex-col-reverse tw:gap-2 tw:rounded-b-[var(--radius-surface)] tw:border-t tw:bg-muted/50 tw:p-4 tw:sm:flex-row tw:sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "tw:text-[var(--fs-title)] tw:leading-none tw:font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "tw:text-[var(--fs-body-s)] tw:text-muted-foreground tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
}
