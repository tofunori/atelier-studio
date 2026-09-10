"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono, paper } from "./surfaces";

export type DiffKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

const GUTTER: Record<DiffKind, string> = {
  context: "",
  added: "+",
  removed: "−",
};

export function CodeDiff({
  filename,
  additions,
  deletions,
  lines,
  cycle,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "filename" | "additions" | "deletions" | "lines" | "cycle"
> & {
  filename: string;
  additions: number;
  deletions: number;
  lines: readonly DiffLine[];
  cycle: number;
}) {
  return (
    <div
      data-slot="code-diff"
      className={cn(
        paper,
        "tw:w-full tw:max-w-md tw:overflow-hidden tw:rounded-2xl tw:font-mono tw:text-xs",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:px-4 tw:pt-3 tw:pb-2">
        <span className="tw:text-foreground/90">{filename}</span>
        <span className={cn(mono, "tw:tabular-nums")}>
          <span className="tw:text-emerald-600 tw:dark:text-emerald-400">
            +{additions}
          </span>{" "}
          <span className="tw:text-red-600 tw:dark:text-red-400">−{deletions}</span>
        </span>
      </div>
      <div className={codeScroll}>
        <div className={codeSurface}>
          {lines.map((line, i) => (
            <div
              key={`${cycle}-${i}-${line.text}`}
              className={cn(
                "tw:fade-in tw:animate-in tw:fill-mode-both tw:flex tw:px-4 tw:py-0.5 tw:leading-relaxed tw:whitespace-pre tw:duration-300",
                line.kind === "context" && "tw:text-foreground/45",
                line.kind === "added" &&
                  "tw:bg-emerald-500/10 tw:text-emerald-700 tw:dark:bg-emerald-500/10 tw:dark:text-emerald-300",
                line.kind === "removed" &&
                  "tw:bg-red-500/10 tw:text-red-700 tw:dark:text-red-300",
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="tw:w-4 tw:shrink-0 tw:select-none">
                {GUTTER[line.kind]}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
