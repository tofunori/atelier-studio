"use client";

import type { ComponentProps } from "react";
import { PencilLineIcon, QuoteIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { floating, mono } from "./surfaces";

export interface QuoteAction {
  key: string;
  label: string;
  icon: "quote" | "explain" | "rewrite";
}

const ICON = {
  quote: QuoteIcon,
  explain: SparklesIcon,
  rewrite: PencilLineIcon,
} as const;

export function QuoteReply({
  before,
  selection,
  after,
  actions,
  toolbarVisible,
  quoted,
  onAction,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "before"
  | "selection"
  | "after"
  | "actions"
  | "toolbarVisible"
  | "quoted"
  | "onAction"
> & {
  before: string;
  selection: string;
  after: string;
  actions: readonly QuoteAction[];
  toolbarVisible: boolean;
  quoted?: string;
  onAction?: (key: string) => void;
}) {
  return (
    <div
      data-slot="quote-reply"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-2.5", className)}

      {...props}
    >
      <p className="tw:relative tw:text-[13.5px] tw:leading-relaxed">
        <span className="tw:text-foreground/70">{before}</span>
        <span className="tw:text-foreground/95 tw:rounded tw:bg-blue-500/18 tw:px-0.5 tw:dark:bg-blue-400/25">
          {selection}
        </span>
        <span className="tw:text-foreground/70">{after}</span>
      </p>

      <div className="tw:flex tw:h-9 tw:items-start">
        {toolbarVisible && (
          <div
            className={cn(
              floating,
              "tw:fade-in tw:zoom-in-95 tw:slide-in-from-top-1 tw:animate-in tw:flex tw:items-center tw:gap-0.5 tw:rounded-full tw:p-1 tw:duration-200",
            )}
          >
            {actions.map((action) => {
              const Icon = ICON[action.icon];
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onAction?.(action.key)}
                  className="tw:text-foreground/60 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:flex tw:h-7 tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
                >
                  <Icon className="tw:size-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {quoted && (
        <div className="tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:flex tw:flex-col tw:gap-1 tw:duration-300">
          <span className={cn(mono, "tw:text-foreground/30")}>replying to</span>
          <div className="tw:border-foreground/15 tw:text-foreground/55 tw:border-s-2 tw:ps-2.5 tw:text-xs tw:leading-relaxed">
            {quoted}
          </div>
        </div>
      )}
    </div>
  );
}
