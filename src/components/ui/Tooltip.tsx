// Tooltip Atelier — API produit stable au-dessus de la primitive shadcn/Base UI.
// Le provider global fixe le délai Precision Native; le Trigger gère lui-même
// hover, focus, Escape, aria-describedby et cleanup.
import React from "react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider as ShadcnTooltipProvider,
  TooltipTrigger,
} from "../shadcn/tooltip";
import type { Placement } from "./internal";

/** Miroir TS du token CSS --tooltip-delay (tokens.css). */
export const TOOLTIP_DELAY_MS = 420;

function placementProps(placement: Placement) {
  const [side, align] = placement.split("-") as ["top" | "bottom", "start" | "end" | undefined];
  return { side, align: (align ?? "center") as "start" | "center" | "end" };
}

export function TooltipProvider({ children }: React.PropsWithChildren) {
  return (
    <ShadcnTooltipProvider delay={TOOLTIP_DELAY_MS} closeDelay={0}>
      {children}
    </ShadcnTooltipProvider>
  );
}

export function Tooltip(props: {
  label: string;
  children: React.ReactElement;
  placement?: Placement;
}) {
  const { label, children, placement = "top" } = props;
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  return (
    <ShadcnTooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        delay={TOOLTIP_DELAY_MS}
        closeDelay={0}
        aria-describedby={open ? id : undefined}
        onBlur={() => setOpen(false)}
        onMouseLeave={() => setOpen(false)}
        render={children}
      />
      <TooltipContent id={id} role="tooltip" {...placementProps(placement)} className="ui-tooltip open">
        {label}
      </TooltipContent>
    </ShadcnTooltip>
  );
}
