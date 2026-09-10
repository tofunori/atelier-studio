"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import {
  BookOpenIcon,
  CheckIcon,
  FilePlus2Icon,
  FolderPlusIcon,
  Settings2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  kbSourcesSnapshot,
  onOpenKbPicker,
  requestKbSources,
  subscribeKbSources,
  type KbBinding,
  type KbSource,
} from "@/lib/kbSources";
import { useKbActions } from "../chat/kbActions";
import { Button } from "./primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./primitives/popover";
import {
  ComposerMenuItem,
} from "./elements/composer-elements";
import {
  ThreadSearch,
  type SearchableThread,
} from "./elements/thread-search";

/**
 * The composer only needs a compact view of the global knowledge library.
 * The complete collection-management surface remains available through the
 * native Connaissances action supplied by the host.
 */
export interface AssistantUiKnowledgePickerProps
  extends Omit<ComponentProps<"div">, "children"> {
  binding: KbBinding;
  /** Open the existing native knowledge surface for collections/admin work. */
  onOpenKnowledgeSurface?: () => void;
}

const KIND_LABELS: Record<string, string> = {
  file: "file",
  folder: "folder",
  pdf: "PDF",
  web: "web",
  youtube: "YouTube",
  note: "note",
  gbrain: "gbrain",
  zotero: "Zotero",
};

export function knowledgeSourceKind(kind: string): string {
  return KIND_LABELS[kind] ?? (kind || "source");
}

export function knowledgeSourcePreview(source: KbSource): string {
  const origin = source.origin?.trim();
  if (origin) return origin;
  if (source.chars > 0) return `${source.chars.toLocaleString()} characters`;
  return knowledgeSourceKind(source.kind);
}

/** Stable, case-insensitive filtering used by the official ThreadSearch leaf. */
export function filterKnowledgeSources(
  sources: readonly KbSource[],
  query: string,
): KbSource[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...sources];
  return sources.filter((source) =>
    `${source.title} ${source.origin ?? ""} ${source.kind}`
      .toLocaleLowerCase()
      .includes(needle),
  );
}

function toSearchableThread(
  source: KbSource,
  attached: ReadonlySet<string>,
): SearchableThread {
  return {
    id: source.id,
    title: source.title || source.id,
    group: knowledgeSourceKind(source.kind),
    preview: knowledgeSourcePreview(source),
    pinned: attached.has(source.id),
  };
}

function sourceLabel(source: KbSource | undefined, id: string): string {
  return source?.title || id;
}

/**
 * Assistant-ui knowledge picker.
 *
 * This deliberately composes the official ThreadSearch/ComposerMenuItem
 * elements and Base UI Popover/Button primitives. KB mutations still go
 * through the shared `useKbActions` hook, so the composer and Connaissances
 * surface retain one binding and one websocket implementation.
 */
export function AssistantUiKnowledgePicker({
  binding,
  onOpenKnowledgeSurface,
  className,
  ...props
}: AssistantUiKnowledgePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSourceId, setActiveSourceId] = useState("");
  const openRef = useRef(open);
  openRef.current = open;
  const actions = useKbActions(binding, () => openRef.current);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const sources = useSyncExternalStore(
    subscribeKbSources,
    kbSourcesSnapshot,
    kbSourcesSnapshot,
  );

  useEffect(() => {
    // The aggregate KB pill and native surfaces use the same event. Do not
    // duplicate a second store or require a prop tunnel through the host.
    return onOpenKbPicker(() => {
      actionsRef.current.setError(null);
      requestKbSources();
      setOpen(true);
    });
  }, []);

  const attached = useMemo(() => new Set(binding.attached), [binding.attached]);
  const visibleSources = useMemo(
    () =>
      sources.filter(
        (source) => !source.archived || attached.has(source.id),
      ),
    [attached, sources],
  );
  const searchableSources = useMemo(
    () => filterKnowledgeSources(visibleSources, query),
    [query, visibleSources],
  );
  const searchRows = useMemo(
    () => searchableSources.map((source) => toSearchableThread(source, attached)),
    [attached, searchableSources],
  );
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const attachedSources = binding.attached.map((id) => sourceById.get(id));

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      actionsRef.current.setError(null);
      requestKbSources();
    }
  };

  return (
    <div
      data-slot="assistant-ui-knowledge-picker"
      className={cn("tw:relative tw:flex tw:items-center", className)}
      {...props}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Knowledge sources"
              aria-expanded={open}
              data-active={open || binding.attached.length > 0 || undefined}
              title={
                binding.attached.length > 0
                  ? `${binding.attached.length} knowledge source${binding.attached.length === 1 ? "" : "s"}`
                  : "Knowledge sources"
              }
            />
          }
        >
          <BookOpenIcon className="tw:size-4" />
          {binding.attached.length > 0 && (
            <span
              aria-label={`${binding.attached.length} attached`}
              className="tw:text-[10px] tw:tabular-nums"
            >
              {binding.attached.length}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="tw:w-[min(23rem,calc(100vw-2rem))] tw:max-w-[calc(100vw-2rem)] tw:max-h-[min(38rem,calc(100vh-5rem))] tw:overflow-y-auto"
        >
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-1">
            <div className="tw:min-w-0">
              <h2 className="tw:text-sm tw:font-medium">Knowledge sources</h2>
              <p className="tw:text-muted-foreground tw:text-xs">
                {binding.attached.length} attached · {visibleSources.length} available
              </p>
            </div>
            {onOpenKnowledgeSurface && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Manage knowledge sources"
                title="Manage knowledge sources"
                onClick={() => {
                  setOpen(false);
                  onOpenKnowledgeSurface();
                }}
              >
                <Settings2Icon className="tw:size-4" />
              </Button>
            )}
          </div>

          <ThreadSearch
            threads={searchRows}
            query={query}
            activeId={activeSourceId}
            onQueryChange={setQuery}
            onSelect={(id) => {
              setActiveSourceId(id);
              actions.toggle(id);
            }}
            placeholder="Search knowledge"
            emptyLabel={query ? `No sources match “${query}”` : "No knowledge sources yet"}
            aria-label="Knowledge source search"
            className="tw:max-w-none tw:border-0 tw:p-0 tw:shadow-none"
          />

          {attachedSources.length > 0 && (
            <section aria-label="Attached knowledge sources" className="tw:flex tw:flex-col tw:gap-1">
              <p className="tw:text-muted-foreground tw:px-2 tw:text-[11px] tw:font-medium tw:uppercase tw:tracking-wide">
                Attached
              </p>
              {attachedSources.map((source, index) => {
                const id = binding.attached[index] ?? "";
                const title = sourceLabel(source, id);
                const full = binding.fullContent.includes(id);
                return (
                  <div key={id} className="tw:flex tw:items-center tw:gap-1">
                    <ComposerMenuItem
                      active={full}
                      aria-pressed={full}
                      aria-label={`${full ? "Use summary" : "Use full content"} for ${title}`}
                      title={full ? "Use summary" : "Use full content"}
                      onClick={() => actions.toggleFull(id)}
                      className="tw:min-w-0 tw:flex-1"
                    >
                      <CheckIcon className="tw:size-3.5 tw:shrink-0 tw:opacity-70" />
                      <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-start">
                        {title}
                      </span>
                      <span className="tw:text-muted-foreground tw:shrink-0 tw:text-[11px]">
                        {full ? "full" : "summary"}
                      </span>
                    </ComposerMenuItem>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Detach ${title}`}
                      title={`Detach ${title}`}
                      onClick={() => actions.toggle(id)}
                    >
                      <XIcon className="tw:size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </section>
          )}

          {actions.error && (
            <div
              role="alert"
              className="tw:bg-destructive/10 tw:text-destructive tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:p-2 tw:text-xs"
            >
              <span className="tw:min-w-0 tw:flex-1">{actions.error}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Dismiss knowledge source error"
                onClick={() => actions.setError(null)}
              >
                <XIcon className="tw:size-3.5" />
              </Button>
            </div>
          )}

          {actions.promoted && (
            <p role="status" className="tw:text-muted-foreground tw:px-2 tw:text-xs">
              <SparklesIcon className="tw:mr-1 tw:inline tw:size-3" />
              Source promoted to the knowledge library.
            </p>
          )}

          <div className="tw:border-border/60 tw:flex tw:flex-wrap tw:gap-1.5 tw:border-t tw:pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void actions.addFiles()}
            >
              <FilePlus2Icon />
              Add files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void actions.addFolder()}
            >
              <FolderPlusIcon />
              Add folder
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
