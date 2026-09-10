"use client";

import { useId, type ComponentProps } from "react";
import { BookmarkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export interface SavedPrompt {
  id: string;
  name: string;
  body: string;
  variables: readonly string[];
}

export function PromptLibrary({
  prompts,
  query,
  selectedId,
  onQueryChange,
  onSelect,
  onInsert,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "prompts"
  | "query"
  | "selectedId"
  | "onQueryChange"
  | "onSelect"
  | "onInsert"
> & {
  prompts: readonly SavedPrompt[];
  query: string;
  selectedId: string;
  onQueryChange?: (query: string) => void;
  onSelect?: (id: string) => void;
  onInsert?: (id: string) => void;
}) {
  const listId = useId();
  const optionId = (id: string) => `${listId}-${id}`;
  const matches = prompts.filter((prompt) =>
    prompt.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = matches.find((prompt) => prompt.id === selectedId);

  const move = (delta: number) => {
    if (matches.length === 0) return;
    const at = matches.findIndex((prompt) => prompt.id === selectedId);
    // selectedId can be filtered out by the query; start from the edge the key implies
    const from = at === -1 ? (delta > 0 ? -1 : 0) : at;
    const next = matches[(from + delta + matches.length) % matches.length];
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
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      onInsert?.(selected.id);
    }
  };

  return (
    <div
      data-slot="prompt-library"
      className={cn(
        paper,
        "tw:flex tw:w-full tw:max-w-sm tw:flex-col tw:gap-2 tw:rounded-2xl tw:p-3",
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
        <BookmarkIcon className="tw:text-foreground/30 tw:size-3.5 tw:shrink-0" />
        <input
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search prompts"
          aria-label="Search saved prompts"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={selected ? optionId(selected.id) : undefined}
          className="tw:text-foreground/85 tw:placeholder:text-foreground/30 tw:min-w-0 tw:flex-1 tw:bg-transparent tw:text-[13px] tw:outline-none"
        />
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="Saved prompts"
        className="tw:flex tw:flex-col"
      >
        {matches.map((prompt) => (
          <button
            key={prompt.id}
            id={optionId(prompt.id)}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={prompt.id === selectedId}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect?.(prompt.id)}
            onDoubleClick={() => onInsert?.(prompt.id)}
            className={cn(
              "tw:flex tw:items-center tw:gap-2 tw:rounded-xl tw:px-2 tw:py-1.5 tw:text-start tw:transition-colors",
              prompt.id === selectedId
                ? "tw:bg-foreground/[0.05]"
                : "tw:hover:bg-foreground/[0.03]",
            )}
          >
            <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-[13px]">
              {prompt.name}
            </span>
            {prompt.variables.length > 0 && (
              <span className={cn(mono, "tw:text-foreground/25 tw:shrink-0")}>
                {prompt.variables.length} vars
              </span>
            )}
          </button>
        ))}
      </div>
      {matches.length === 0 && (
        <span className="tw:text-foreground/30 tw:block tw:px-2 tw:py-3 tw:text-center tw:text-xs tw:break-words">
          Nothing matches “{query}”
        </span>
      )}

      {selected && (
        <div
          className={cn(
            field,
            "tw:fade-in tw:animate-in tw:flex tw:flex-col tw:gap-2 tw:rounded-xl tw:p-2.5 tw:duration-200",
          )}
        >
          <p className="tw:text-foreground/65 tw:text-xs tw:leading-relaxed tw:break-words">
            {selected.body}
          </p>
          {selected.variables.length > 0 && (
            <div className="tw:flex tw:flex-wrap tw:gap-1">
              {selected.variables.map((variable) => (
                <span
                  key={variable}
                  className={cn(
                    mono,
                    "tw:bg-background/70 tw:text-foreground/50 tw:rounded tw:px-1.5 tw:py-0.5",
                  )}
                >
                  {`{${variable}}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
