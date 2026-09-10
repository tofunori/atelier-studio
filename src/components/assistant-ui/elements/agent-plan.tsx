"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import { pct, progressOf } from "../utils/range";

export function AgentPlan({
  steps,
  activeIndex,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "steps" | "activeIndex"> & {
  steps: readonly string[];
  activeIndex: number;
}) {
  const total = steps.length;
  const completed = progressOf(activeIndex, total);
  const allDone = completed >= total;
  const progress = pct(completed, total);

  return (
    <div
      data-slot="agent-plan"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3", className)}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:justify-between">
        <span className="tw:text-[13.5px] tw:font-medium">Plan</span>
        <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
          {completed} of {total}
        </span>
      </div>
      <div className="tw:bg-foreground/[0.06] tw:h-[3px] tw:w-full tw:overflow-hidden tw:rounded-full">
        <span
          className="tw:bg-foreground/80 tw:block tw:h-full tw:rounded-full tw:transition-[width] tw:duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="tw:flex tw:flex-col tw:gap-2.5">
        {steps.map((step, i) => {
          const done = allDone || i < completed;
          const active = !allDone && i === completed;
          return (
            <li key={step} className="tw:flex tw:items-center tw:gap-2.5 tw:text-[13.5px]">
              <span className="tw:flex tw:size-4 tw:shrink-0 tw:items-center tw:justify-center">
                {done ? (
                  <CheckIcon className="tw:text-foreground/35 tw:size-3.5" />
                ) : active ? (
                  <Loader2Icon className="tw:text-foreground/90 tw:size-3.5 tw:animate-spin tw:motion-reduce:animate-none" />
                ) : (
                  <span
                    aria-hidden
                    className="tw:bg-foreground/15 tw:size-1.5 tw:rounded-full"
                  />
                )}
              </span>
              <span
                className={cn(
                  done && "tw:text-foreground/40",
                  active && "tw:text-foreground/90",
                  !done && !active && "tw:text-foreground/35",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
