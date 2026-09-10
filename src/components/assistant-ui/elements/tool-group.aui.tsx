"use client";

import {
  memo,
  useCallback,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useScrollLock } from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/assistant-ui/primitives/collapsible";
import { cn } from "@/lib/utils";

const ANIMATION_DURATION = 200;

const toolGroupVariants = cva("aui-tool-group-root tw:group/tool-group tw:w-full", {
  variants: {
    variant: {
      outline: "tw:rounded-lg tw:border tw:py-3",
      ghost: "",
      muted: "tw:border-muted-foreground/30 tw:bg-muted/30 tw:rounded-lg tw:border tw:py-3",
    },
  },
  defaultVariants: { variant: "outline" },
});

export type ToolGroupRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof toolGroupVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
  };

function ToolGroupRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolGroupRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      lockScroll();
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-group-root"
      data-variant={variant ?? "outline"}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        toolGroupVariants({ variant }),
        "tw:group/tool-group-root",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolGroupTrigger({
  count,
  active = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
  active?: boolean;
}) {
  const label = `${count} tool ${count === 1 ? "call" : "calls"}`;

  return (
    <CollapsibleTrigger
      data-slot="tool-group-trigger"
      className={cn(
        "aui-tool-group-trigger tw:group/trigger tw:flex tw:origin-left tw:items-center tw:gap-2 tw:text-sm tw:transition-[color,scale] tw:active:scale-[0.98]",
        "tw:group-data-[variant=ghost]/tool-group-root:text-muted-foreground tw:group-data-[variant=ghost]/tool-group-root:hover:text-foreground tw:group-data-[variant=ghost]/tool-group-root:py-1.5",
        "tw:group-data-[variant=outline]/tool-group-root:w-full tw:group-data-[variant=outline]/tool-group-root:px-4",
        "tw:group-data-[variant=muted]/tool-group-root:w-full tw:group-data-[variant=muted]/tool-group-root:px-4",
        className,
      )}
      {...props}
    >
      {active && (
        <LoaderIcon
          data-slot="tool-group-trigger-loader"
          className="aui-tool-group-trigger-loader tw:size-3 tw:shrink-0 tw:animate-spin tw:[animation-duration:0.6s]"
        />
      )}
      <span
        data-slot="tool-group-trigger-label"
        className={cn(
          "aui-tool-group-trigger-label-wrapper tw:inline-block tw:text-start tw:text-xs tw:leading-none tw:font-medium",
          "tw:group-data-[variant=ghost]/tool-group-root:font-normal",
          "tw:group-data-[variant=outline]/tool-group-root:grow",
          "tw:group-data-[variant=muted]/tool-group-root:grow",
          active && "tw:shimmer tw:motion-reduce:animate-none",
        )}
      >
        {label}
      </span>
      <ChevronDownIcon
        data-slot="tool-group-trigger-chevron"
        className={cn(
          "aui-tool-group-trigger-chevron tw:size-3 tw:shrink-0",
          "tw:transition-transform tw:duration-(--animation-duration) tw:ease-[cubic-bezier(0.32,0.72,0,1)] tw:motion-reduce:transition-none",
          "tw:-rotate-90",
          "tw:group-data-open/trigger:rotate-0",
          "tw:group-data-panel-open/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-group-content"
      className={cn(
        "aui-tool-group-content tw:relative tw:overflow-hidden tw:text-sm tw:outline-none",
        "tw:group/collapsible-content tw:ease-[cubic-bezier(0.32,0.72,0,1)] tw:motion-reduce:animate-none",
        "tw:data-closed:animate-collapsible-up",
        "tw:data-open:animate-collapsible-down",
        "tw:data-closed:fill-mode-forwards",
        "tw:data-closed:pointer-events-none",
        "tw:[--tw-duration:var(--animation-duration)]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "tw:mt-2 tw:flex tw:flex-col tw:gap-2",
          "tw:group-data-[variant=ghost]/tool-group-root:mt-1 tw:group-data-[variant=ghost]/tool-group-root:gap-1",
          "tw:group-data-[variant=outline]/tool-group-root:mt-3 tw:group-data-[variant=outline]/tool-group-root:border-t tw:group-data-[variant=outline]/tool-group-root:px-4 tw:group-data-[variant=outline]/tool-group-root:pt-3",
          "tw:group-data-[variant=muted]/tool-group-root:mt-3 tw:group-data-[variant=muted]/tool-group-root:border-t tw:group-data-[variant=muted]/tool-group-root:px-4 tw:group-data-[variant=muted]/tool-group-root:pt-3",
          "tw:[&>*]:animate-in tw:[&>*]:fade-in-0 tw:[&>*]:blur-in-[2px] tw:[&>*]:slide-in-from-top-1 tw:[&>*]:animation-duration-(--animation-duration) tw:[&>*]:ease-[cubic-bezier(0.32,0.72,0,1)]",
          "tw:[&>*]:motion-reduce:animate-none",
          "tw:[&>*:nth-child(2)]:[animation-delay:40ms]",
          "tw:[&>*:nth-child(3)]:[animation-delay:80ms]",
          "tw:[&>*:nth-child(4)]:[animation-delay:120ms]",
          "tw:[&>*:nth-child(n+5)]:[animation-delay:160ms]",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

type ToolGroupComponent = FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> & {
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
  Content: typeof ToolGroupContent;
};

const ToolGroupImpl: FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> = ({ children, startIndex, endIndex }) => {
  const toolCount = endIndex - startIndex + 1;

  return (
    <ToolGroupRoot>
      <ToolGroupTrigger count={toolCount} />
      <ToolGroupContent>{children}</ToolGroupContent>
    </ToolGroupRoot>
  );
};

/**
 * @deprecated This wrapper targets the legacy `components.ToolGroup` prop
 * on `<MessagePrimitive.Parts>`. Use `<MessagePrimitive.GroupedParts>` with
 * a `groupBy` returning `"group-tool"` and compose `ToolGroupRoot` /
 * `ToolGroupTrigger` / `ToolGroupContent` directly. See `thread.tsx`.
 */
const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = "ToolGroup";
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export {
  ToolGroup,
  ToolGroupRoot,
  ToolGroupTrigger,
  ToolGroupContent,
  toolGroupVariants,
};
