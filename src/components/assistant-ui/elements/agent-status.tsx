"use client";

import type { ComponentProps } from "react";
import { CheckIcon, PauseIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

export type AgentState = "working" | "waiting" | "done";

export interface StatusStep {
  state: AgentState;
  label: string;
}

export function AgentStatus({
  state,
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "state" | "label" | "elapsed"> & {
  state: AgentState;
  label: string;
  elapsed?: string;
}) {
  return (
    <div
      data-slot="agent-status"
      className={cn(
        paper,
        "tw:flex tw:items-center tw:gap-2.5 tw:rounded-full tw:py-1.5 tw:ps-3.5 tw:pe-1.5",
        className,
      )}

      {...props}
    >
      {state === "done" ? (
        <CheckIcon aria-hidden className="tw:size-3 tw:shrink-0 tw:text-emerald-500" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "tw:size-1.5 tw:shrink-0 tw:rounded-full tw:motion-reduce:animate-none",
            state === "working"
              ? "tw:animate-pulse tw:bg-blue-500 tw:dark:bg-blue-400"
              : "tw:border-foreground/35 border",
          )}
        />
      )}
      <span className="tw:sr-only">{state}</span>
      <span
        key={label}
        className="tw:fade-in tw:blur-in-[2px] tw:animate-in tw:max-w-44 tw:truncate tw:text-xs tw:duration-300 tw:motion-reduce:animate-none"
      >
        {label}
      </span>
      {elapsed !== undefined && state !== "done" && (
        <span className={cn(mono, "tw:text-foreground/30 tw:tabular-nums")}>
          {elapsed}
        </span>
      )}
      <span
        aria-hidden
        className="tw:text-foreground/45 tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full"
      >
        {state === "done" ? (
          <RotateCcwIcon className="tw:size-3" />
        ) : (
          <PauseIcon className="tw:size-3" />
        )}
      </span>
    </div>
  );
}
