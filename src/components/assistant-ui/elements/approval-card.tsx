// Official assistant-ui element source, adapted only with the Atelier tw: prefix.
"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon, TerminalIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, paper } from "./surfaces";

export type ApprovalState = "request" | "running" | "done" | "denied";

export function ApprovalCard({
  state,
  command,
  title,
  subtitle,
  onAllowOnce,
  onAlwaysAllow,
  onDeny,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "state"
  | "command"
  | "title"
  | "subtitle"
  | "onAllowOnce"
  | "onAlwaysAllow"
  | "onDeny"
> & {
  state: ApprovalState;
  command: string;
  title: string;
  subtitle: string;
  onAllowOnce?: () => void;
  onAlwaysAllow?: () => void;
  onDeny?: () => void;
}) {
  return (
    <div
      data-slot="approval-card"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3.5 tw:rounded-[20px] tw:p-4",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:gap-3">
        <span className="tw:bg-foreground/[0.05] tw:text-foreground/45 tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl">
          <TerminalIcon className="tw:size-4" />
        </span>
        <div className="tw:flex tw:flex-col">
          <p className="tw:text-[13.5px] tw:font-medium">{title}</p>
          <p className="tw:text-foreground/45 tw:text-xs">{subtitle}</p>
        </div>
      </div>

      <div
        className={cn(
          field,
          "tw:text-foreground/70 tw:rounded-xl tw:px-3.5 tw:py-2.5 tw:font-mono tw:text-xs",
        )}
      >
        {command}
      </div>

      <div className="tw:flex tw:h-8 tw:items-center tw:justify-end tw:gap-2">
        {state === "request" ? (
          <>
            <button
              type="button"
              onClick={onDeny}
              className="tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-8 tw:rounded-full tw:px-3.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={onAlwaysAllow}
              className="tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-8 tw:rounded-full tw:px-3.5 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
            >
              Always allow
            </button>
            <button
              type="button"
              onClick={onAllowOnce}
              className={cn(
                inkButton,
                "tw:flex tw:h-8 tw:items-center tw:rounded-full tw:px-3.5 tw:text-xs tw:font-medium",
              )}
            >
              Allow once
            </button>
          </>
        ) : (
          <div
            key={state}
            className="tw:fade-in tw:animate-in tw:text-foreground/55 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:duration-300"
          >
            {state === "running" ? (
              <>
                <Loader2Icon className="tw:text-foreground/45 tw:size-3.5 tw:animate-spin" />
                Approved, running
              </>
            ) : state === "denied" ? (
              <>
                <XIcon className="tw:text-foreground/45 tw:size-3.5" />
                Denied
              </>
            ) : (
              <>
                <CheckIcon className="tw:size-3.5 tw:text-emerald-500" />
                Finished with exit 0
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
