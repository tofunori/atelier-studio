"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";
import { announced, pct } from "../utils/range";

const fmt = (n: number) => n.toLocaleString("en-US");

export interface EffortLevel {
  key: string;
  label: string;
  budget?: number;
}

export function ReasoningEffort({
  levels,
  selectedKey,
  spent,
  onSelect,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "levels" | "selectedKey" | "spent" | "onSelect"
> & {
  levels: readonly EffortLevel[];
  selectedKey: string;
  spent?: number;
  onSelect?: (key: string) => void;
}) {
  const selected = levels.find((level) => level.key === selectedKey);
  const budget = selected?.budget;
  const hasUsage = spent !== undefined && Number.isFinite(spent) && spent >= 0
    && budget !== undefined && Number.isFinite(budget) && budget > 0;
  const used = hasUsage ? pct(spent, budget) : 0;

  return (
    <div
      data-slot="reasoning-effort"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-2.5", className)}

      {...props}
    >
      <div className="tw:flex tw:items-baseline tw:justify-between">
        <span className="tw:text-[13.5px] tw:font-medium">Thinking</span>
        <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
          {hasUsage ? `${fmt(spent)} / ${fmt(budget)}` : "Consommation indisponible"}
        </span>
      </div>

      <div className={cn(field, "tw:flex tw:gap-0.5 tw:rounded-full tw:p-0.5")}>
        {levels.map((level) => {
          const active = level.key === selectedKey;
          return (
            <button
              key={level.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect?.(level.key)}
              className={cn(
                "tw:flex-1 tw:rounded-full tw:py-1 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.97]",
                active
                  ? "tw:bg-background tw:text-foreground/90"
                  : "tw:text-foreground/45 tw:hover:text-foreground/70",
              )}
            >
              {level.label}
            </button>
          );
        })}
      </div>

      {hasUsage && <span
        role="progressbar"
        aria-label="Thinking budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announced(used)}
        aria-valuetext={`${fmt(spent)} of ${fmt(budget)}`}
        className="tw:bg-foreground/[0.06] tw:h-[3px] tw:w-full tw:overflow-hidden tw:rounded-full"
      >
        <span
          className="tw:block tw:h-full tw:rounded-full tw:bg-blue-500 tw:transition-[width] tw:duration-500 tw:motion-reduce:transition-none tw:dark:bg-blue-400"
          style={{ width: `${used}%` }}
        />
      </span>}
    </div>
  );
}
