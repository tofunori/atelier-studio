"use client";

import type { ComponentProps } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, inkButton, mono, paper } from "./surfaces";
import type { DiffLine } from "./code-diff";

export type HunkDecision = "pending" | "kept" | "discarded";

export interface DiffHunk {
  id: string;
  range: string;
  decision: HunkDecision;
  lines: readonly DiffLine[];
}

const GUTTER = { context: "", added: "+", removed: "−" } as const;

export function ReviewableDiff({
  filename,
  hunks,
  onKeep,
  onDiscard,
  onApply,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "filename" | "hunks" | "onKeep" | "onDiscard" | "onApply"
> & {
  filename: string;
  hunks: readonly DiffHunk[];
  onKeep?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onApply?: () => void;
}) {
  const kept = hunks.filter((hunk) => hunk.decision === "kept").length;
  const pending = hunks.filter((hunk) => hunk.decision === "pending").length;

  return (
    <div
      data-slot="reviewable-diff"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-md tw:flex-col tw:overflow-hidden tw:rounded-2xl",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:px-4 tw:pt-3 tw:pb-2">
        <span className="tw:font-mono tw:text-xs">{filename}</span>
        <span className={cn(mono, "tw:text-foreground/35 tw:tabular-nums")}>
          {kept} of {hunks.length} kept
        </span>
      </div>

      <div className="tw:flex tw:flex-col">
        {hunks.map((hunk) => (
          <div
            key={hunk.id}
            className={cn(
              "tw:border-foreground/[0.06] tw:border-t tw:transition-opacity tw:duration-300",
              hunk.decision === "discarded" && "tw:opacity-40",
            )}
          >
            <div className="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-1.5">
              <span className={cn(mono, "tw:text-foreground/30")}>
                {hunk.range}
              </span>
              <span className="tw:ms-auto tw:flex tw:items-center tw:gap-1">
                {hunk.decision === "pending" ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Discard hunk ${hunk.range}`}
                      onClick={() => onDiscard?.(hunk.id)}
                      className="tw:text-foreground/45 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:flex tw:h-6 tw:items-center tw:gap-1 tw:rounded-full tw:px-2 tw:text-[11px] tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
                    >
                      <XIcon className="tw:size-3" />
                      Discard
                    </button>
                    <button
                      type="button"
                      aria-label={`Keep hunk ${hunk.range}`}
                      onClick={() => onKeep?.(hunk.id)}
                      className="tw:flex tw:h-6 tw:items-center tw:gap-1 tw:rounded-full tw:bg-emerald-500/12 tw:px-2 tw:text-[11px] tw:font-medium tw:text-emerald-700 tw:transition-[background-color,scale] tw:duration-150 tw:hover:bg-emerald-500/20 tw:active:scale-[0.96] tw:dark:text-emerald-300"
                    >
                      <CheckIcon className="tw:size-3" />
                      Keep
                    </button>
                  </>
                ) : (
                  <span
                    className={cn(
                      mono,
                      "tw:fade-in tw:animate-in tw:duration-300",
                      hunk.decision === "kept"
                        ? "tw:text-emerald-600 tw:dark:text-emerald-400"
                        : "tw:text-foreground/35",
                    )}
                  >
                    {hunk.decision}
                  </span>
                )}
              </span>
            </div>
            <div className={cn(codeScroll, "tw:pb-1.5 tw:font-mono tw:text-xs")}>
              <div className={codeSurface}>
                {hunk.lines.map((line, i) => (
                  <div
                    key={`${hunk.id}-${i}`}
                    className={cn(
                      "tw:flex tw:px-4 tw:py-0.5 tw:leading-relaxed tw:whitespace-pre",
                      line.kind === "context" && "tw:text-foreground/40",
                      line.kind === "added" &&
                        "tw:bg-emerald-500/10 tw:text-emerald-700 tw:dark:text-emerald-300",
                      line.kind === "removed" &&
                        "tw:bg-red-500/10 tw:text-red-700 tw:dark:text-red-300",
                    )}
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
        ))}
      </div>

      <div className="tw:border-foreground/[0.06] tw:flex tw:items-center tw:justify-between tw:border-t tw:px-4 tw:py-2.5">
        <span className={cn(mono, "tw:text-foreground/35")}>
          {pending > 0 ? `${pending} left to review` : "All reviewed"}
        </span>
        <button
          type="button"
          disabled={pending > 0}
          onClick={onApply}
          className={cn(
            inkButton,
            "tw:flex tw:h-7 tw:items-center tw:rounded-full tw:px-3 tw:text-xs tw:font-medium tw:disabled:pointer-events-none tw:disabled:opacity-30",
          )}
        >
          Apply {kept}
        </button>
      </div>
    </div>
  );
}
