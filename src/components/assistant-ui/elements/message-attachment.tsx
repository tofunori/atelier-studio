"use client";

import type { ComponentProps } from "react";
import { FileTextIcon, ImageIcon, PaperclipIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export interface MessageAttachmentItem {
  id: string;
  name: string;
  size: string;
  kind: "image" | "document" | "file";
  pages?: number;
  swatch?: string;
}

export function MessageAttachments({
  attachments,
  onOpen,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "attachments" | "onOpen"> & {
  attachments: readonly MessageAttachmentItem[];
  onOpen?: (id: string) => void;
}) {
  return (
    <div
      data-slot="message-attachments"
      className={cn("tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-1.5", className)}

      {...props}
    >
      {attachments.map((item) =>
        item.kind === "image" ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen?.(item.id)}
            className={cn(
              paper,
              "tw:fade-in tw:animate-in tw:fill-mode-both group tw:flex tw:w-full tw:items-center tw:gap-3 tw:overflow-hidden tw:rounded-2xl tw:p-2 tw:text-start tw:duration-300",
            )}
          >
            <span
              aria-hidden
              className="tw:size-12 tw:shrink-0 tw:rounded-xl tw:bg-cover tw:bg-center tw:transition-transform tw:duration-300 tw:group-hover:scale-[1.04] tw:motion-reduce:transition-none"
              style={{
                backgroundImage: item.swatch,
                backgroundColor: "var(--color-foreground)",
              }}
            />
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5 tw:pe-2">
              <span className="tw:text-foreground/90 tw:truncate tw:text-[13.5px]">
                {item.name}
              </span>
              <span className={cn(mono, "tw:text-foreground/35")}>
                {item.size}
              </span>
            </span>
            <ImageIcon className="tw:text-foreground/25 tw:me-2 tw:size-3.5 tw:shrink-0" />
          </button>
        ) : (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen?.(item.id)}
            className={cn(
              field,
              "tw:fade-in tw:animate-in tw:fill-mode-both tw:hover:bg-foreground/[0.07] tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:rounded-2xl tw:px-3 tw:py-2.5 tw:text-start tw:transition-colors tw:duration-300",
            )}
          >
            <span className="tw:bg-background/70 tw:text-foreground/45 tw:flex tw:size-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg">
              {item.kind === "document" ? (
                <FileTextIcon className="tw:size-3.5" />
              ) : (
                <PaperclipIcon className="tw:size-3.5" />
              )}
            </span>
            <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
              <span className="tw:text-foreground/90 tw:truncate tw:text-[13.5px]">
                {item.name}
              </span>
              <span className={cn(mono, "tw:text-foreground/35")}>
                {item.size}
                {item.pages !== undefined && ` · ${item.pages} pages`}
              </span>
            </span>
          </button>
        ),
      )}
    </div>
  );
}
