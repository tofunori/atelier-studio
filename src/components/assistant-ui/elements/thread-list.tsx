"use client";

import type { ComponentProps } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";

export interface ThreadItem {
  title: string;
  time: string;
  unread?: boolean;
}

export function ThreadList({
  threads,
  activeIndex,
  onActiveIndexChange,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "threads" | "activeIndex" | "onActiveIndexChange"
> & {
  threads: readonly ThreadItem[];
  activeIndex: number;
  onActiveIndexChange?: (index: number) => void;
}) {
  return (
    <div
      data-slot="thread-list"
      className={cn("tw:flex tw:w-full tw:max-w-[240px] tw:flex-col tw:gap-0.5", className)}

      {...props}
    >
      <div className={cn(mono, "tw:text-foreground/35 tw:px-3 tw:pb-1.5")}>Today</div>
      {threads.map((thread, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={thread.title}
            type="button"
            aria-current={active || undefined}
            onClick={() => onActiveIndexChange?.(i)}
            className={cn(
              "group tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-xl tw:px-3 tw:py-2 tw:text-start tw:text-[13.5px] tw:transition-colors",
              active ? field : "tw:hover:bg-foreground/[0.03]",
            )}
          >
            <span className="tw:flex-1 tw:truncate">{thread.title}</span>
            <span
              className={cn(
                mono,
                "tw:text-foreground/35 tw:flex tw:items-center tw:gap-1.5 tw:tabular-nums tw:group-hover:hidden",
              )}
            >
              {thread.unread && !active && (
                <>
                  <span
                    aria-hidden
                    className="tw:size-1.5 tw:rounded-full tw:bg-blue-500 tw:dark:bg-blue-400"
                  />
                  <span className="tw:sr-only">unread</span>
                </>
              )}
              {thread.time}
            </span>
            <span className="tw:hidden tw:items-center tw:gap-0.5 tw:group-hover:flex">
              <span className="tw:text-foreground/45 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:rounded-full tw:p-1">
                <PencilIcon className="tw:size-3" />
              </span>
              <span className="tw:text-foreground/45 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:rounded-full tw:p-1">
                <Trash2Icon className="tw:size-3" />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
