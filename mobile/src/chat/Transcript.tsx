import { useCallback } from "react";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller.tsx";
import { ArrowDownIcon } from "lucide-react";
import type { InteractionResponse } from "./interactionTypes.ts";
import type { ChatStoreApi } from "./store/useChatStore.ts";
import { TurnBlock } from "./TurnBlock.tsx";

type Props = {
  store: ChatStoreApi;
  threadId: string;
  reducedMotion?: boolean;
  disableVirtualization?: boolean;
  onInteractionRespond?: (
    requestId: string,
    response: InteractionResponse,
    clientRequestId: string,
  ) => Promise<void>;
};

export function Transcript(p: Props) {
  const { store } = p;
  const streamingTurnId = store.streaming?.turnId;
  const onHeight = useCallback(
    (turnId: string, height: number) => store.setTurnHeight(turnId, height),
    [store.setTurnHeight],
  );

  return (
    <div className="transcript-wrap">
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            <MessageScrollerContent className="w-full min-w-0 max-w-full overflow-x-hidden px-4 py-3">
              {store.turnOrder.map((turnId) => (
                <MessageScrollerItem
                  key={turnId}
                  messageId={turnId}
                  scrollAnchor={streamingTurnId === turnId}
                >
                  <TurnBlock
                    turnId={turnId}
                    threadId={p.threadId}
                    items={store.itemsForTurn(turnId)}
                    onHeight={onHeight}
                    pinnedStreaming={streamingTurnId === turnId}
                    onInteractionRespond={p.onInteractionRespond}
                  />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton
            size="default"
            onClick={store.clearNewItems}
            aria-label="Aller aux nouveaux messages"
          >
            <ArrowDownIcon data-icon="inline-start" />
            {store.state.presentation.newItemCount > 0
              ? `${store.state.presentation.newItemCount} nouveau${store.state.presentation.newItemCount > 1 ? "x" : ""}`
              : "Dernier message"}
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}
