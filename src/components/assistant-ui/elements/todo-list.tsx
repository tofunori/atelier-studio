"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export type TodoStatus = "pending" | "active" | "done" | "failed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  reason?: string;
}

export function TodoList({
  items,
  revision,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "items" | "revision"> & {
  items: readonly TodoItem[];
  revision?: number;
}) {
  const done = items.filter((item) => item.status === "done").length;

  return (
    <div
      data-slot="todo-list"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3", className)}
      {...props}
    >
      <div className="tw:flex tw:items-baseline tw:justify-between">
        <span className="tw:text-[13.5px] tw:font-medium">Todos</span>
        <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
          {revision === undefined
            ? `${done}/${items.length}`
            : `${done}/${items.length} · rev ${revision}`}
        </span>
      </div>
      <ul className="tw:flex tw:flex-col tw:gap-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="tw:fade-in tw:slide-in-from-bottom-1 tw:animate-in tw:fill-mode-both tw:flex tw:items-start tw:gap-2.5 tw:py-0.5 tw:text-[13.5px] tw:duration-300"
          >
            <span
              aria-hidden
              className="tw:flex tw:size-4 tw:h-5 tw:shrink-0 tw:items-center tw:justify-center"
            >
              {item.status === "done" ? (
                <span className="tw:border-foreground/20 tw:bg-foreground/[0.06] tw:flex tw:size-3.5 tw:items-center tw:justify-center tw:rounded-[5px] border">
                  <CheckIcon className="tw:text-foreground/45 tw:size-2.5" />
                </span>
              ) : item.status === "failed" ? (
                <span className="tw:flex tw:size-3.5 tw:items-center tw:justify-center tw:rounded-[5px] border tw:border-red-600/25 tw:bg-red-600/[0.08] tw:dark:border-red-400/25 tw:dark:bg-red-400/[0.08]">
                  <XIcon className="tw:size-2.5 tw:text-red-600 tw:dark:text-red-400" />
                </span>
              ) : item.status === "active" ? (
                <Loader2Icon className="tw:size-3.5 tw:animate-spin tw:text-blue-500 tw:motion-reduce:animate-none tw:dark:text-blue-400" />
              ) : (
                <span className="tw:border-foreground/15 tw:size-3.5 tw:rounded-[5px] border" />
              )}
            </span>
            <span className="tw:sr-only">{item.status}</span>
            <div className="tw:min-w-0 tw:flex-1 tw:leading-5 tw:break-words">
              <span
                className={cn(
                  item.status === "done" &&
                    "tw:text-foreground/35 tw:line-through tw:decoration-[1.5px]",
                  item.status === "active" && "tw:text-foreground/90",
                  item.status === "pending" && "tw:text-foreground/50",
                  item.status === "failed" && "tw:text-red-600 tw:dark:text-red-400",
                )}
              >
                {item.text}
              </span>
              {item.status === "failed" && item.reason ? (
                <p className="tw:text-foreground/45 tw:text-xs tw:leading-4 tw:break-words">
                  {item.reason}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
