"use client";

import type { ComponentProps } from "react";
import { KeyRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";

export type GrantScope = "session" | "always" | "denied";

export function PermissionGrant({
  capability,
  requester,
  reach,
  scope,
  onGrant,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "capability" | "requester" | "reach" | "scope" | "onGrant"
> & {
  capability: string;
  requester: string;
  reach: readonly string[];
  scope: GrantScope | "pending";
  onGrant?: (scope: GrantScope) => void;
}) {
  return (
    <div
      data-slot="permission-grant"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-3.5 tw:rounded-[20px] tw:p-4",
        className,
      )}

      {...props}
    >
      <div className="tw:flex tw:items-center tw:gap-2.5">
        <span className="tw:bg-foreground/[0.05] tw:text-foreground/45 tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg">
          <KeyRoundIcon className="tw:size-3.5" />
        </span>
        <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
          <span className="tw:truncate tw:text-[13.5px] tw:font-medium">
            {capability}
          </span>
          <span className="tw:text-foreground/45 tw:truncate tw:text-xs">
            requested by {requester}
          </span>
        </div>
      </div>

      <div className="tw:flex tw:flex-col tw:gap-1">
        <span className={cn(mono, "tw:text-foreground/30")}>this grants</span>
        {reach.map((item) => (
          <span
            key={item}
            className="tw:text-foreground/60 tw:flex tw:items-baseline tw:gap-2 tw:text-xs"
          >
            <span
              aria-hidden
              className="tw:bg-foreground/20 tw:size-1 tw:rounded-full"
            />
            {item}
          </span>
        ))}
      </div>

      <div className="tw:flex tw:h-8 tw:items-center tw:justify-end tw:gap-2">
        {scope === "pending" ? (
          <>
            <button
              type="button"
              onClick={() => onGrant?.("denied")}
              className="tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-8 tw:rounded-full tw:px-3 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={() => onGrant?.("session")}
              className="tw:text-foreground/55 tw:hover:bg-foreground/[0.06] tw:hover:text-foreground/90 tw:h-8 tw:rounded-full tw:px-3 tw:text-xs tw:font-medium tw:transition-[background-color,color,scale] tw:duration-150 tw:active:scale-[0.96]"
            >
              This session
            </button>
            <button
              type="button"
              onClick={() => onGrant?.("always")}
              className={cn(
                inkButton,
                "tw:flex tw:h-8 tw:items-center tw:rounded-full tw:px-3 tw:text-xs tw:font-medium",
              )}
            >
              Always
            </button>
          </>
        ) : (
          <span
            key={scope}
            className={cn(
              field,
              mono,
              "tw:fade-in tw:animate-in tw:text-foreground/55 tw:rounded-full tw:px-2.5 tw:py-1.5 tw:duration-300",
            )}
          >
            {scope === "denied" ? "denied" : `granted · ${scope}`}
          </span>
        )}
      </div>
    </div>
  );
}
