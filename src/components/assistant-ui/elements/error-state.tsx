"use client";

import type { ComponentProps } from "react";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

export interface ErrorStateProps extends Omit<
  ComponentProps<"div">,
  "children" | "role"
> {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry: () => void;
}

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          "tw:fade-in tw:animate-in tw:flex tw:w-full tw:max-w-sm tw:items-center tw:gap-2.5 tw:text-sm tw:duration-300 tw:motion-reduce:animate-none",
          className,
        )}

        {...props}
      >
        <RefreshCwIcon className="tw:text-foreground/45 tw:size-3.5 tw:shrink-0 tw:animate-spin tw:motion-reduce:animate-none" />
        <ShimmerLabel className="tw:text-foreground/55 tw:relative tw:inline-block">
          Retrying
        </ShimmerLabel>
      </div>
    );
  }

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        "tw:fade-in tw:animate-in tw:flex tw:w-full tw:max-w-sm tw:items-start tw:gap-2.5 tw:rounded-2xl tw:bg-red-500/[0.06] tw:px-4 tw:py-3 tw:text-sm tw:duration-300 tw:motion-reduce:animate-none tw:dark:bg-red-500/10",
        className,
      )}

      {...props}
    >
      <CircleAlertIcon className="tw:mt-0.5 tw:size-4 tw:shrink-0 tw:text-red-500/80" />
      <div>
        <p className="tw:font-medium tw:text-red-600 tw:dark:text-red-400">{title}</p>
        <p className="tw:mt-0.5 tw:text-[13px] tw:leading-snug tw:text-red-600/60 tw:dark:text-red-400/60">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="tw:ms-auto tw:flex tw:items-center tw:gap-1.5 tw:rounded-full tw:px-3 tw:py-1 tw:text-xs tw:font-medium tw:text-red-600 tw:transition-colors tw:hover:bg-red-500/10 tw:dark:text-red-400"
      >
        <RefreshCwIcon className="tw:size-3" />
        Retry
      </button>
    </div>
  );
}
