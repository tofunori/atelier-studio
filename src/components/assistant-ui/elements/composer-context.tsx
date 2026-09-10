"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { clamp, pct } from "../utils/range";
import { floating, ghostButton, mono } from "./surfaces";

export interface ComposerUsage {
  system: number;
  tools: number;
  messages: number;
  total: number;
}

export function ComposerContext({
  usage,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { usage: ComposerUsage }) {
  const used = usage.system + usage.tools + usage.messages;
  const fraction = usage.total === 0 ? 0 : used / usage.total;
  const warn = fraction > 0.85;
  const circumference = 2 * Math.PI * 6;
  const segments = [
    { label: "System", value: usage.system, className: "tw:bg-foreground/25" },
    { label: "Tools", value: usage.tools, className: "tw:bg-foreground/45" },
    { label: "Messages", value: usage.messages, className: "tw:bg-foreground/80" },
  ];

  return (
    <div
      data-slot="composer-context"
      className={cn("tw:group/ctx tw:relative", className)}
      {...props}
    >
      <div
        className={cn(
          floating,
          "tw:absolute tw:end-0 tw:bottom-full tw:z-10 tw:mb-2 tw:flex tw:w-60 tw:origin-bottom-right tw:flex-col tw:gap-3.5 tw:rounded-2xl tw:p-4",
          "tw:transition-[opacity,scale] tw:duration-200 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
          "tw:pointer-events-none tw:scale-[0.97] tw:opacity-0",
          "tw:group-hover/ctx:pointer-events-auto tw:group-hover/ctx:scale-100 tw:group-hover/ctx:opacity-100",
          "tw:group-focus-within/ctx:pointer-events-auto tw:group-focus-within/ctx:scale-100 tw:group-focus-within/ctx:opacity-100",
        )}
      >
        <div className="tw:flex tw:items-baseline tw:justify-between">
          <p className="tw:text-[13.5px] tw:font-medium">Context</p>
          <p
            className={cn(
              mono,
              "tw:tabular-nums",
              warn ? "tw:text-red-500 tw:dark:text-red-400" : "tw:text-foreground/35",
            )}
          >
            {Math.round(fraction * 100)}%
          </p>
        </div>
        <div className="tw:bg-foreground/[0.06] tw:flex tw:h-[5px] tw:w-full tw:gap-px tw:overflow-hidden tw:rounded-full">
          {segments.map((segment) => (
            <span
              key={segment.label}
              className={cn(
                "tw:h-full tw:transition-[width] tw:duration-700 tw:motion-reduce:transition-none",
                segment.className,
              )}
              style={{ width: `${pct(segment.value, usage.total)}%` }}
            />
          ))}
        </div>
        <div className="tw:flex tw:flex-col tw:gap-2">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className="tw:text-foreground/55 tw:flex tw:items-center tw:gap-2.5 tw:text-[13px]"
            >
              <span
                aria-hidden
                className={cn("tw:size-1.5 tw:rounded-full", segment.className)}
              />
              <span className="tw:flex-1">{segment.label}</span>
              <span className={cn(mono, "tw:text-foreground/40 tw:tabular-nums")}>
                {segment.value}k
              </span>
            </div>
          ))}
        </div>
        <div className="tw:bg-foreground/[0.06] tw:h-px" />
        <div className="tw:text-foreground/55 tw:flex tw:items-center tw:justify-between tw:text-[13px]">
          <span>Total</span>
          <span className={cn(mono, "tw:text-foreground/40 tw:tabular-nums")}>
            {used}k / {usage.total}k
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Context usage"
        className={cn(
          ghostButton,
          "tw:size-8",
          warn && "tw:text-red-500 tw:dark:text-red-400",
        )}
      >
        <svg viewBox="0 0 16 16" className="tw:size-4 tw:-rotate-90" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            className="tw:stroke-foreground/10"
          />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="tw:stroke-current tw:transition-[stroke-dashoffset] tw:duration-700 tw:motion-reduce:transition-none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamp(fraction, 0, 1))}
          />
        </svg>
      </button>
    </div>
  );
}
