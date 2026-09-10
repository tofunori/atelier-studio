"use client";

import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { cn } from "@/lib/utils";
import { floating } from "./surfaces";
import { clamp } from "../utils/range";

export interface ConversationMapEntry {
  id: string;
  title: string;
  preview?: string;
}

const TICK = '[data-slot="conversation-map-tick"]';

export function ConversationMap({
  entries,
  activeId,
  visibleIds,
  onSelect,
  side = "right",
  className,
  onKeyDown,
  ...props
}: Omit<ComponentProps<"nav">, "children" | "onSelect"> & {
  entries: readonly ConversationMapEntry[];
  activeId?: string | undefined;
  visibleIds?: readonly string[] | undefined;
  onSelect?: ((id: string) => void) | undefined;
  side?: "left" | "right";
}) {
  const railRef = useRef<HTMLElement>(null);
  const [handle] = useState(() =>
    PreviewCard.createHandle<ConversationMapEntry>(),
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const inView = new Set(visibleIds);
  const activeIndex = entries.findIndex((entry) => entry.id === activeId);
  const tabbableIndex = clamp(
    focusedIndex ?? Math.max(0, activeIndex),
    0,
    Math.max(0, entries.length - 1),
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const ticks = railRef.current?.querySelectorAll<HTMLElement>(TICK);
      if (!ticks?.length) return;

      const current = Array.prototype.indexOf.call(ticks, event.target);
      if (current === -1) return;

      const next = {
        ArrowUp: current - 1,
        ArrowDown: current + 1,
        Home: 0,
        End: ticks.length - 1,
      }[event.key];
      if (next === undefined) return;

      event.preventDefault();
      ticks[clamp(next, 0, ticks.length - 1)]?.focus();
    },
    [onKeyDown],
  );

  return (
    <nav
      data-slot="conversation-map"
      ref={railRef}
      aria-label="Conversation map"
      onKeyDown={handleKeyDown}
      className={cn(
        "tw:group/rail tw:flex tw:h-full tw:w-6 tw:flex-col tw:justify-center",
        className,
      )}
      {...props}
    >
      {entries.map((entry, index) => {
        const current = index === activeIndex;
        const onScreen = current || inView.has(entry.id);
        return (
          <PreviewCard.Trigger
            key={entry.id}
            handle={handle}
            payload={entry}
            delay={120}
            closeDelay={80}
            render={<button type="button" />}
            data-slot="conversation-map-tick"
            data-active={current ? "" : undefined}
            data-in-view={onScreen ? "" : undefined}
            aria-label={entry.title}
            aria-current={current ? "true" : undefined}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onFocus={() => setFocusedIndex(index)}
            onClick={() => onSelect?.(entry.id)}
            // The cap keeps a short thread packed instead of spread over the
            // whole gutter; a long one outgrows it and the share decides.
            className="tw:group tw:flex tw:max-h-3.5 tw:min-h-0 tw:flex-1 tw:items-center tw:outline-none"
          >
            {/* At rest every tick is the same short length and only weight and
                depth separate the tiers. Pointing at the rail grows them out by
                tier, and the one actually under the pointer reaches full length
                so the rail says which turn the card belongs to. */}
            <span
              className={cn(
                "tw:w-3 tw:rounded-full tw:transition-[width,height,background-color] tw:duration-200 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
                current
                  ? "tw:bg-foreground/90 tw:h-[3px] tw:group-focus-within/rail:w-6 tw:group-hover/rail:w-6"
                  : cn(
                      "tw:group-hover:bg-foreground/70 tw:group-focus-visible:bg-foreground/70 tw:h-0.5",
                      "tw:group-hover:w-6! tw:group-focus-visible:w-6!",
                      onScreen
                        ? "tw:bg-foreground/50 tw:group-focus-within/rail:w-[18px] tw:group-hover/rail:w-[18px]"
                        : "tw:bg-foreground/15",
                    ),
              )}
            />
          </PreviewCard.Trigger>
        );
      })}

      <PreviewCard.Root handle={handle}>
        {({ payload }) => (
          <PreviewCard.Portal>
            <PreviewCard.Positioner side={side} sideOffset={10} data-assistant-ui-portal="conversation-map">
              <PreviewCard.Popup
                className={cn(
                  floating,
                  "tw:z-50 tw:w-60 tw:origin-(--transform-origin) tw:rounded-2xl tw:p-3.5 tw:outline-none",
                  "tw:transition-[opacity,scale] tw:duration-200 tw:ease-[cubic-bezier(0.23,1,0.32,1)] tw:motion-reduce:transition-none",
                  "tw:data-[starting-style]:scale-[0.97] tw:data-[starting-style]:opacity-0",
                  "tw:data-[ending-style]:scale-[0.97] tw:data-[ending-style]:opacity-0",
                )}
              >
                <p className="tw:line-clamp-2 tw:text-[13px] tw:leading-snug tw:font-medium">
                  {payload?.title}
                </p>
                {payload?.preview && (
                  <p className="tw:text-foreground/50 tw:mt-1 tw:line-clamp-3 tw:text-[13px] tw:leading-relaxed">
                    {payload.preview}
                  </p>
                )}
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        )}
      </PreviewCard.Root>
    </nav>
  );
}
