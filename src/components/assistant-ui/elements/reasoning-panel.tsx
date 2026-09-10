"use client";

import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/assistant-ui/primitives/collapsible";
import { cn } from "@/lib/utils";
import { collapsePanel, mono, ShimmerLabel, SwapLabel } from "./surfaces";
import { take } from "../utils/range";

export interface ReasoningStep {
  title: string;
  body: string;
}

export interface ReasoningPanelProps {
  steps: ReasoningStep[];
  visibleSteps: number;
  streaming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restingLabel: string;
  elapsed?: string;
  className?: string;
}

export function ReasoningPanel({
  steps,
  visibleSteps,
  streaming,
  open,
  onOpenChange,
  restingLabel,
  elapsed,
  className,
}: ReasoningPanelProps) {
  const shown = take(steps, visibleSteps);

  return (
    <Collapsible
      data-slot="reasoning-panel"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("tw:w-full tw:max-w-sm", className)}
    >
      <CollapsibleTrigger className="tw:group/trigger tw:text-foreground/55 tw:hover:text-foreground/90 tw:flex tw:items-center tw:gap-1.5 tw:py-1 tw:text-[13.5px] tw:transition-[color,scale] tw:outline-none tw:active:scale-[0.98]">
        <SwapLabel active={streaming ? 0 : 1} className="tw:text-start">
          <>
            <ShimmerLabel
              active={streaming}
              className="tw:relative tw:inline-block tw:leading-none"
            >
              Thinking
            </ShimmerLabel>
            {elapsed !== undefined && (
              <span className={cn(mono, "tw:text-foreground/30 tw:tabular-nums")}>
                {elapsed}
              </span>
            )}
          </>
          <>{restingLabel}</>
        </SwapLabel>
        <ChevronDownIcon className="tw:size-3.5 tw:shrink-0 tw:opacity-60 tw:transition-transform tw:duration-200 tw:ease-[cubic-bezier(0.32,0.72,0,1)] tw:group-data-open/trigger:rotate-180 tw:group-data-panel-open/trigger:rotate-180 tw:motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "tw:outline-none")}>
        <ol className="tw:flex tw:flex-col tw:gap-4 tw:pt-3 tw:pb-1">
          {shown.map((step, i) => {
            const active = streaming && i === shown.length - 1;
            return (
              <li
                key={step.title}
                className="tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:fill-mode-both tw:flex tw:gap-3 tw:duration-300"
              >
                <span
                  aria-hidden
                  className={cn(
                    "tw:mt-[7px] tw:size-[5px] tw:shrink-0 tw:rounded-full tw:transition-colors tw:duration-300",
                    active
                      ? "tw:animate-pulse tw:bg-blue-500 tw:dark:bg-blue-400"
                      : "tw:bg-foreground/20",
                  )}
                />
                <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
                  <p className="tw:text-foreground/90 tw:text-[13.5px] tw:font-medium">
                    {step.title}
                  </p>
                  <p className="tw:text-foreground/50 tw:mt-0.5 tw:text-[13px] tw:leading-relaxed tw:break-words">
                    {step.body}
                  </p>
                </span>
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
