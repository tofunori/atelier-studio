"use client";

import type { ComponentProps } from "react";
import { PinIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export interface SearchableThread {
  id: string;
  title: string;
  group: string;
  preview: string;
  pinned?: boolean;
}

export function ThreadSearch({
  threads,
  query,
  activeId,
  onQueryChange,
  onSelect,
  placeholder = "Search threads",
  emptyLabel,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "threads" | "query" | "activeId" | "onQueryChange" | "onSelect"
> & {
  threads: readonly SearchableThread[];
  query: string;
  activeId: string;
  onQueryChange?: (query: string) => void;
  onSelect?: (id: string) => void;
  /** Label for the search field when this official surface is reused by a domain list. */
  placeholder?: string;
  /** Empty state label; defaults to the upstream thread wording. */
  emptyLabel?: string;
}) {
  const matches = threads.filter((thread) =>
    `${thread.title} ${thread.preview}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pinned = matches.filter((thread) => thread.pinned);
  const groups = [
    ...new Set(matches.filter((t) => !t.pinned).map((t) => t.group)),
  ];

  const ordered = [
    ...pinned,
    ...groups.flatMap((group) =>
      matches.filter((thread) => !thread.pinned && thread.group === group),
    ),
  ];

  const move = (delta: number) => {
    if (ordered.length === 0) return;
    const at = ordered.findIndex((thread) => thread.id === activeId);
    // activeId can be filtered out by the query; start from the edge the key implies
    const from = at === -1 ? (delta > 0 ? -1 : 0) : at;
    const next = ordered[(from + delta + ordered.length) % ordered.length];
    if (next) onSelect?.(next.id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    }
  };

  const row = (thread: SearchableThread) => (
    <button
      key={thread.id}
      type="button"
      onClick={() => onSelect?.(thread.id)}
      className={cn(
        "tw:flex tw:flex-col tw:gap-0.5 tw:rounded-xl tw:px-2 tw:py-1 tw:text-start tw:transition-colors",
        thread.id === activeId
          ? "tw:bg-foreground/[0.05]"
          : "tw:hover:bg-foreground/[0.03]",
      )}
    >
      <span className="tw:flex tw:items-center tw:gap-1.5">
        {thread.pinned && (
          <PinIcon className="tw:text-foreground/30 tw:size-2.5 tw:shrink-0" />
        )}
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px]">
          {thread.title}
        </span>
      </span>
      <span className="tw:text-foreground/35 tw:truncate tw:text-xs">
        {thread.preview}
      </span>
    </button>
  );

  return (
    <div
      data-slot="thread-search"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-1.5 tw:rounded-2xl tw:p-3",
        className,
      )}

      {...props}
    >
      <div
        className={cn(
          field,
          "tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:px-2.5 tw:py-1.5",
        )}
      >
        <SearchIcon className="tw:text-foreground/30 tw:size-3.5 tw:shrink-0" />
        <input
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className="tw:text-foreground/85 tw:placeholder:text-foreground/30 tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-[13px] tw:outline-none"
        />
      </div>

      {pinned.length > 0 && (
        <div className="tw:flex tw:flex-col">
          <span className={cn(mono, "tw:text-foreground/25 tw:px-2 tw:pb-1")}>
            pinned
          </span>
          {pinned.map(row)}
        </div>
      )}

      {groups.map((group) => (
        <div key={group} className="tw:flex tw:flex-col">
          <span className={cn(mono, "tw:text-foreground/25 tw:px-2 tw:pb-1")}>
            {group}
          </span>
          {matches
            .filter((thread) => !thread.pinned && thread.group === group)
            .map(row)}
        </div>
      ))}

      {matches.length === 0 && (
        <span className="tw:text-foreground/30 tw:px-2 tw:py-4 tw:text-center tw:text-xs">
          {emptyLabel ?? `No thread matches “${query}”`}
        </span>
      )}
    </div>
  );
}
