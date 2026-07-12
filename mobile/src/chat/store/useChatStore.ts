import { useCallback, useMemo, useReducer, useRef } from "react";
import { StreamFrameBuffer } from "../stream/frameBuffer.ts";
import { reduceChat, type ChatAction } from "./reducer.ts";
import {
  selectIsBusy,
  selectMetrics,
  selectScrollMode,
  selectStreamingItem,
  selectTurnItems,
  selectTurnOrder,
  selectTransport,
} from "./selectors.ts";
import { emptyThreadState, type ThreadChatState, type WireLikeEvent } from "./types.ts";

export function useChatStore(threadId: string) {
  const [state, dispatch] = useReducer(
    reduceChat,
    threadId,
    (id) => emptyThreadState(id),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const bufferRef = useRef<StreamFrameBuffer | null>(null);
  if (!bufferRef.current) {
    bufferRef.current = new StreamFrameBuffer({
      apply: (events) => {
        for (const ev of events) {
          dispatch({ type: "event", event: ev });
        }
      },
      onFlush: (n) => dispatch({ type: "visual_flush", itemsUpdated: n }),
    });
  }

  const loadHistory = useCallback((events: WireLikeEvent[]) => {
    bufferRef.current?.dispose();
    bufferRef.current = new StreamFrameBuffer({
      apply: (evs) => {
        for (const ev of evs) dispatch({ type: "event", event: ev });
      },
      onFlush: (n) => dispatch({ type: "visual_flush", itemsUpdated: n }),
    });
    dispatch({ type: "load_history", threadId, events });
  }, [threadId]);

  const pushEvent = useCallback((ev: WireLikeEvent) => {
    bufferRef.current?.push(ev);
  }, []);

  const pushEventsImmediate = useCallback((events: WireLikeEvent[]) => {
    bufferRef.current?.flush();
    for (const ev of events) dispatch({ type: "event", event: ev });
  }, []);

  const optimisticUser = useCallback(
    (messageId: string, text: string, clientRequestId: string) => {
      dispatch({ type: "optimistic_user", messageId, text, clientRequestId });
    },
    [],
  );

  const setScrollMode = useCallback((mode: ThreadChatState["presentation"]["scrollMode"]) => {
    dispatch({ type: "set_scroll_mode", mode });
  }, []);

  const setTurnHeight = useCallback((turnId: string, height: number) => {
    dispatch({ type: "set_turn_height", turnId, height });
  }, []);

  const clearNewItems = useCallback(() => {
    dispatch({ type: "clear_new_items" });
  }, []);

  const sendAccepted = useCallback((clientRequestId: string) => {
    dispatch({ type: "send_accepted", clientRequestId });
  }, []);

  const sendFailed = useCallback((error: string) => {
    dispatch({ type: "send_failed", error });
  }, []);

  const stopRequested = useCallback(() => {
    dispatch({ type: "stop_requested" });
  }, []);

  const promoteItem = useCallback((itemId: string) => {
    dispatch({ type: "promote_item", itemId });
  }, []);

  const dispatchAction = useCallback((a: ChatAction) => dispatch(a), []);

  const api = useMemo(
    () => ({
      state,
      loadHistory,
      pushEvent,
      pushEventsImmediate,
      optimisticUser,
      setScrollMode,
      setTurnHeight,
      clearNewItems,
      sendAccepted,
      sendFailed,
      stopRequested,
      promoteItem,
      dispatch: dispatchAction,
      // selectors
      turnOrder: selectTurnOrder(state),
      transport: selectTransport(state),
      scrollMode: selectScrollMode(state),
      metrics: selectMetrics(state),
      busy: selectIsBusy(state),
      streaming: selectStreamingItem(state),
      itemsForTurn: (turnId: string) => selectTurnItems(state, turnId),
    }),
    [
      state,
      loadHistory,
      pushEvent,
      pushEventsImmediate,
      optimisticUser,
      setScrollMode,
      setTurnHeight,
      clearNewItems,
      sendAccepted,
      sendFailed,
      stopRequested,
      promoteItem,
      dispatchAction,
    ],
  );

  return api;
}

export type ChatStoreApi = ReturnType<typeof useChatStore>;
