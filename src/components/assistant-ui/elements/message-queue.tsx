"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, ghostButton, mono, paper } from "./surfaces";

export interface QueuedMessage {
  id: string;
  text: string;
}

export function MessageQueue({
  running,
  queued,
  onCancel,
  renderActions,
  active = true,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "running" | "queued" | "onCancel"
> & {
  running: string;
  queued: readonly QueuedMessage[];
  onCancel?: (id: string) => void;
  renderActions?: (message: QueuedMessage, index: number) => ReactNode;
  active?: boolean;
}) {
  return (
    <div
      data-slot="message-queue"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-2", className)}

      {...props}
    >
      <div className={cn(paper, "tw:flex tw:items-center tw:gap-2.5 tw:rounded-2xl tw:p-3")}>
        <span className="tw:relative tw:flex tw:size-2 tw:shrink-0">
          <span className="tw:absolute tw:inline-flex tw:size-full tw:animate-ping tw:rounded-full tw:bg-blue-500/60 tw:motion-reduce:hidden" />
          <span className="tw:relative tw:inline-flex tw:size-2 tw:rounded-full tw:bg-blue-500 tw:dark:bg-blue-400" />
        </span>
        <span className="tw:text-foreground/90 tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px]">
          {running}
        </span>
        <span className={cn(mono, "tw:text-foreground/35 tw:shrink-0")}>{active ? "running" : "paused"}</span>
      </div>

      {queued.length > 0 && (
        <div className="tw:flex tw:items-baseline tw:justify-between tw:px-1">
          <span className={cn(mono, "tw:text-foreground/35")}>
            {queued.length} queued
          </span>
          <span className={cn(mono, "tw:text-foreground/35")}>
            {active ? "sends when this finishes" : "waiting to resume"}
          </span>
        </div>
      )}

      <ul className="tw:flex tw:flex-col tw:gap-1.5">
        {queued.map((message, index) => (
          <li
            key={message.id}
            className={cn(
              field,
              "tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:fill-mode-both tw:flex tw:items-center tw:gap-2.5 tw:rounded-2xl tw:py-2 tw:pr-2 tw:pl-3 tw:duration-300",
            )}
          >
            <span
              className={cn(
                mono,
                "tw:text-foreground/30 tw:w-3 tw:shrink-0 tw:tabular-nums",
              )}
            >
              {index + 1}
            </span>
            <span className="tw:text-foreground/60 tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13.5px]">
              {message.text}
            </span>
            {renderActions?.(message, index)}
            <ArrowUpIcon className="tw:text-foreground/25 tw:size-3 tw:shrink-0" />
            <button
              type="button"
              aria-label={`Remove "${message.text}" from the queue`}
              onClick={() => onCancel?.(message.id)}
              className={cn(ghostButton, "tw:size-6 tw:shrink-0")}
            >
              <XIcon className="tw:size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
