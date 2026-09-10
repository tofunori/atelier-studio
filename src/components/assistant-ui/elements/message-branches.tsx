"use client";

import type { ComponentProps } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, mono } from "./surfaces";

export interface MessageBranchesProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  variants: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
}

export function MessageBranches({
  variants,
  index,
  onIndexChange,
  className,
  ...props
}: MessageBranchesProps) {
  const message = variants[index] ?? variants[0] ?? "";
  const hasNavigation = variants.length > 1;

  const goPrevious = () => {
    if (!hasNavigation) return;
    onIndexChange(index === 0 ? variants.length - 1 : index - 1);
  };
  const goNext = () => {
    if (!hasNavigation) return;
    onIndexChange(index === variants.length - 1 ? 0 : index + 1);
  };

  return (
    <div
      data-slot="message-branches"
      className={cn("tw:flex tw:max-w-sm tw:flex-col tw:gap-2", className)}

      {...props}
    >
      <p
        key={index}
        className="tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:text-foreground/90 tw:min-h-[4.25rem] tw:text-sm tw:leading-relaxed tw:duration-300 tw:motion-reduce:animate-none"
      >
        {message}
      </p>
      <div className="tw:flex tw:items-center tw:gap-1">
        <button
          type="button"
          aria-label="Show previous response"
          disabled={!hasNavigation}
          onClick={goPrevious}
          className={cn(ghostButton, "tw:size-6")}
        >
          <ChevronLeftIcon className="tw:size-3.5" />
        </button>
        <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
          {variants.length === 0
            ? "0 / 0"
            : `${index + 1} / ${variants.length}`}
        </span>
        <button
          type="button"
          aria-label="Show next response"
          disabled={!hasNavigation}
          onClick={goNext}
          className={cn(ghostButton, "tw:size-6")}
        >
          <ChevronRightIcon className="tw:size-3.5" />
        </button>
      </div>
    </div>
  );
}
