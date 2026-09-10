"use client";

import type { ComponentProps } from "react";
import { AlertCircleIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export function ToolError({
  name,
  target,
  message,
  attempt,
  maxAttempts,
  retrying,
  onRetry,
  onSkip,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "name"
  | "target"
  | "message"
  | "attempt"
  | "maxAttempts"
  | "retrying"
  | "onRetry"
  | "onSkip"
> & {
  name: string;
  target: string;
  message: string;
  attempt: number;
  maxAttempts: number;
  retrying: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div
      data-slot="tool-error"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3 tw:rounded-2xl tw:p-3.5",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:gap-2.5">
        <AlertCircleIcon className="tw:size-3.5 tw:shrink-0 tw:text-red-500" />
        <span className={cn(mono, "tw:text-foreground/55 tw:shrink-0")}>{name}</span>
        <span className="tw:text-foreground/80 tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px]">
          {target}
        </span>
        <span className={cn(mono, "tw:text-foreground/30 tw:shrink-0 tw:tabular-nums")}>
          {attempt}/{maxAttempts}
        </span>
      </div>

      <div
        className={cn(
          field,
          "tw:rounded-xl tw:px-3 tw:py-2 tw:font-mono tw:text-[11px] tw:leading-relaxed tw:text-red-700 tw:dark:text-red-300",
        )}
      >
        {message}
      </div>

      <div className="tw:flex tw:items-center tw:justify-end tw:gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={!onSkip}
          className="tw:text-foreground/45 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-7 tw:rounded-full tw:px-2.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96] tw:disabled:pointer-events-none tw:disabled:opacity-30"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="tw:text-foreground/70 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/95 tw:flex tw:h-7 tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96] tw:disabled:pointer-events-none"
        >
          {retrying ? (
            <Loader2Icon className="tw:size-3 tw:animate-spin tw:motion-reduce:animate-none" />
          ) : (
            <RotateCwIcon className="tw:size-3" />
          )}
          {retrying ? "Retrying" : "Retry"}
        </button>
      </div>
    </div>
  );
}
