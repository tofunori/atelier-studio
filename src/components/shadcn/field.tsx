import * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/shadcn/separator"

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("tw:flex tw:min-w-0 tw:flex-col tw:gap-4", className)}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "tw:mb-1.5 tw:font-medium tw:data-[variant=label]:text-[var(--fs-caption)] tw:data-[variant=legend]:text-[var(--fs-body-s)]",
        className,
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("tw:group/field-group tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-4", className)}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "tw:group/field tw:flex tw:w-full tw:min-w-0 tw:gap-1 tw:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "tw:flex-col",
        horizontal: "tw:flex-row tw:items-center tw:gap-2",
        responsive: "tw:flex-col tw:@md/field-group:flex-row tw:@md/field-group:items-center tw:@md/field-group:gap-2",
      },
    },
    defaultVariants: { orientation: "vertical" },
  },
)

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Root> & VariantProps<typeof fieldVariants>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof FieldPrimitive.Label>) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn("tw:text-[var(--fs-caption)] tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<typeof FieldPrimitive.Description>) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("tw:text-[var(--fs-caption)] tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: React.ComponentProps<typeof FieldPrimitive.Error>) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn("tw:text-[var(--fs-caption)] tw:text-destructive", className)}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-title"
      className={cn("tw:text-[var(--fs-body-s)] tw:font-medium tw:text-foreground", className)}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { children?: React.ReactNode }) {
  return (
    <div
      data-slot="field-separator"
      data-content={Boolean(children)}
      className={cn("tw:relative tw:flex tw:h-5 tw:items-center", className)}
      {...props}
    >
      <Separator className="tw:absolute tw:inset-x-0" />
      {children && (
        <span className="tw:relative tw:mx-auto tw:bg-background tw:px-2 tw:text-[var(--fs-caption)] tw:text-muted-foreground">
          {children}
        </span>
      )}
    </div>
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
}
