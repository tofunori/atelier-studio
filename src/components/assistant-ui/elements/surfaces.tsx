"use client";

import type { ComponentProps } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const paper = "tw:bg-background tw:border tw:border-border/60 tw:dark:bg-popover";

export const floating = "tw:bg-background tw:border tw:border-border/60 tw:dark:bg-popover";

export const field = "tw:bg-foreground/[0.04] tw:dark:bg-foreground/[0.06]";

export const fieldInteractive =
  "tw:bg-foreground/[0.04] tw:transition-colors tw:hover:bg-foreground/[0.07] tw:dark:bg-foreground/[0.06] tw:dark:hover:bg-foreground/[0.09]";

export const pressable =
  "tw:transition-transform tw:duration-150 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:active:scale-[0.96] tw:motion-reduce:transition-none";

export const ghostButton =
  "tw:flex tw:items-center tw:justify-center tw:rounded-full tw:text-foreground/45 tw:outline-none tw:transition-[background-color,color,scale] tw:duration-150 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:active:scale-[0.96] tw:focus-visible:ring-1 tw:focus-visible:ring-foreground/20 tw:motion-reduce:transition-none tw:dark:hover:bg-foreground/[0.09]";

export const inkButton =
  "tw:bg-foreground tw:text-background tw:transition-[opacity,scale] tw:duration-150 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:hover:opacity-90 tw:active:scale-[0.96] tw:motion-reduce:transition-none";

export const iconSwap =
  "tw:[grid-area:1/1] tw:transition-[opacity,scale,filter] tw:duration-200 tw:ease-[cubic-bezier(0.2,0,0,1)] tw:motion-reduce:transition-none";

export const iconSwapIn = "tw:scale-100 tw:opacity-100 tw:blur-none";

export const iconSwapOut = "tw:scale-[0.25] tw:opacity-0 tw:blur-[4px]";

export const labelSwap =
  "tw:col-start-1 tw:row-start-1 tw:flex tw:w-max tw:items-center tw:gap-1.5 tw:leading-none tw:transition-[opacity,filter] tw:duration-300 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none";

export const labelSwapIn = "tw:opacity-100 tw:blur-none";

export const labelSwapOut =
  "tw:pointer-events-none tw:select-none tw:opacity-0 tw:blur-[2px]";

export const collapsePanel =
  "tw:h-(--collapsible-panel-height) tw:overflow-hidden tw:transition-[height] tw:duration-200 tw:ease-[cubic-bezier(0.32,0.72,0,1)] tw:data-[ending-style]:h-0 tw:data-[starting-style]:h-0 tw:motion-reduce:transition-none";

export const live = "tw:text-blue-500 tw:dark:text-blue-400";

export const mono = "tw:font-mono tw:text-[11px] tw:tracking-tight";

export function ShimmerLabel({
  active = true,
  className,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      className={cn(active && "tw:shimmer tw:motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/**
 * Scroll region for content that keeps its own whitespace. `whitespace-pre` in
 * a bounded box clips a long line with no way to reach it, so the rows scroll
 * instead.
 *
 * `codeSurface` wraps all the rows as one block, and the rows are its children.
 * It cannot go on each row: `min-width: 100%` resolves against the scroll
 * container's visible width rather than its scroll width, so a per-row width
 * leaves every row except the longest ending its background at the fold.
 */
export const codeScroll = "tw:overflow-x-auto";

export const codeSurface = "tw:w-max tw:min-w-full";

export function SwapLabel({
  active,
  children,
  className,
}: {
  active: 0 | 1;
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}) {
  const layers = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const target = layers[active]?.current;
    if (!target) return undefined;
    const measure = () =>
      setWidth(Math.ceil(target.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  return (
    <span
      style={width === null ? undefined : { width }}
      className={cn(
        "tw:grid tw:overflow-x-clip tw:transition-[width] tw:duration-300 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
        className,
      )}
    >
      {children.map((layer, index) => (
        <span
          key={index}
          ref={layers[index]}
          aria-hidden={active !== index}
          className={cn(
            labelSwap,
            active === index ? labelSwapIn : labelSwapOut,
          )}
        >
          {layer}
        </span>
      ))}
    </span>
  );
}
