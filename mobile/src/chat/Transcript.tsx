import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  distanceFromBottom,
  modeFromScroll,
  maybeCatchUp,
  shouldFollowStream,
  scrollTopToPin,
  JUMP_THRESHOLD_PX,
} from "./scroll/scrollContract.ts";
import { selectVisibleTurns } from "./store/selectors.ts";
import type { InteractionResponse } from "./interactionTypes.ts";
import type { ChatStoreApi } from "./store/useChatStore.ts";
import { TurnBlock } from "./TurnBlock.tsx";

type Props = {
  store: ChatStoreApi;
  threadId: string;
  reducedMotion?: boolean;
  /** Disable virtualization for VoiceOver (accessibility). */
  disableVirtualization?: boolean;
  onInteractionRespond?: (
    requestId: string,
    response: InteractionResponse,
    clientRequestId: string,
  ) => Promise<void>;
};

export function Transcript(p: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { store } = p;
  const { state, turnOrder, setScrollMode, setTurnHeight, clearNewItems, streaming } = store;

  const scrollMode = state.presentation.scrollMode;
  const newItemCount = state.presentation.newItemCount;

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const m = {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
    let mode = modeFromScroll(m, state.presentation.scrollMode);
    mode = maybeCatchUp(mode, state.presentation.newItemCount);
    if (mode !== state.presentation.scrollMode) {
      setScrollMode(mode);
    }
  }, [setScrollMode, state.presentation.scrollMode, state.presentation.newItemCount]);

  // Follow stream when pinned
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !shouldFollowStream(scrollMode)) return;
    el.scrollTop = scrollTopToPin(el);
  }, [scrollMode, state.durable.itemOrder.length, streaming?.text, state.presentation.metrics.visualFlushCount]);

  const onHeight = useCallback(
    (turnId: string, height: number) => {
      const prev = state.presentation.turnHeights[turnId];
      if (prev != null && Math.abs(prev - height) < 1) return;
      const el = scrollerRef.current;
      const beforeBottom = el ? distanceFromBottom(el) : 0;
      setTurnHeight(turnId, height);
      // preserve reading anchor: if reading, compensate height delta
      if (el && state.presentation.scrollMode === "reading" && prev != null) {
        const delta = height - prev;
        if (delta !== 0) el.scrollTop += delta;
      } else if (el && shouldFollowStream(state.presentation.scrollMode)) {
        el.scrollTop = scrollTopToPin(el);
      } else if (el && beforeBottom <= JUMP_THRESHOLD_PX) {
        el.scrollTop = scrollTopToPin(el);
      }
    },
    [setTurnHeight, state.presentation.turnHeights, state.presentation.scrollMode],
  );

  const scrollMetrics = {
    scrollTop: scrollerRef.current?.scrollTop ?? 0,
    scrollHeight: scrollerRef.current?.scrollHeight ?? 0,
    clientHeight: scrollerRef.current?.clientHeight ?? 600,
  };

  const window = useMemo(() => {
    if (p.disableVirtualization) {
      return {
        start: 0,
        end: turnOrder.length,
        offsetY: 0,
        totalHeight: turnOrder.length * state.presentation.estimatedTurnHeight,
        turnIds: turnOrder,
      };
    }
    return selectVisibleTurns(state, {
      scrollTop: scrollMetrics.scrollTop,
      viewportHeight: scrollMetrics.clientHeight || 600,
      overscan: 3,
    });
  }, [
    p.disableVirtualization,
    turnOrder,
    state,
    scrollMetrics.scrollTop,
    scrollMetrics.clientHeight,
    state.presentation.metrics.visualFlushCount,
    state.presentation.turnHeights,
  ]);

  // Always include streaming turn even if outside window
  const renderTurnIds = useMemo(() => {
    const ids = new Set(window.turnIds);
    if (streaming) ids.add(streaming.turnId);
    // preserve order
    return turnOrder.filter((id) => ids.has(id));
  }, [window.turnIds, streaming, turnOrder]);

  const jumpToBottom = () => {
    clearNewItems();
    const el = scrollerRef.current;
    if (el) el.scrollTop = scrollTopToPin(el);
  };

  return (
    <div className="transcript-wrap">
      <div
        ref={scrollerRef}
        className="transcript"
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!p.disableVirtualization && (
          <div style={{ height: window.offsetY }} aria-hidden />
        )}
        {renderTurnIds.map((turnId) => (
          <TurnBlock
            key={turnId}
            turnId={turnId}
            threadId={p.threadId}
            items={store.itemsForTurn(turnId)}
            onHeight={onHeight}
            pinnedStreaming={streaming?.turnId === turnId}
            onInteractionRespond={p.onInteractionRespond}
          />
        ))}
        {!p.disableVirtualization && (
          <div
            style={{
              height: Math.max(
                0,
                window.totalHeight -
                  window.offsetY -
                  renderTurnIds.reduce(
                    (acc, id) =>
                      acc + (state.presentation.turnHeights[id] ?? state.presentation.estimatedTurnHeight),
                    0,
                  ),
              ),
            }}
            aria-hidden
          />
        )}
      </div>
      {(scrollMode === "catch-up" || (scrollMode === "reading" && newItemCount > 0)) && (
        <button type="button" className="catchup-chip" onClick={jumpToBottom}>
          Nouveaux messages{newItemCount > 0 ? ` (${newItemCount})` : ""}
        </button>
      )}
    </div>
  );
}
