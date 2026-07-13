import { memo, useEffect, useRef } from "react";
import { InteractionCard } from "./InteractionCard.tsx";
import { MessageContent } from "./MessageContent.tsx";
import type { InteractionResponse } from "./interactionTypes.ts";
import type { ChatItem } from "./store/types.ts";
import { ACTIVITY_KINDS, AgentActivity } from "./AgentActivity.tsx";
import { Bubble, BubbleContent } from "@/components/ui/bubble.tsx";
import {
  Message,
  MessageContent as MessageBody,
} from "@/components/ui/message.tsx";
import { cn } from "@/lib/utils.ts";

type Props = {
  turnId: string;
  threadId: string;
  items: ChatItem[];
  onHeight: (turnId: string, height: number) => void;
  /** Keep mounted even if outside window when streaming. */
  pinnedStreaming?: boolean;
  onInteractionRespond?: (
    requestId: string,
    response: InteractionResponse,
    clientRequestId: string,
  ) => Promise<void>;
};

function TurnBlockInner(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const activityItems = p.items.filter((item) => ACTIVITY_KINDS.has(item.kind));
  let activityRendered = false;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => p.onHeight(p.turnId, el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h != null) p.onHeight(p.turnId, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.turnId, p.onHeight, p.items]);

  return (
    <div
      ref={ref}
      className="turn-block w-full min-w-0 max-w-full overflow-x-hidden"
      data-turn={p.turnId}
      data-streaming={p.pinnedStreaming ? "1" : "0"}
    >
      {p.items.map((it) => {
        if (ACTIVITY_KINDS.has(it.kind)) {
          if (activityRendered) return null;
          activityRendered = true;
          return <AgentActivity key={`activity:${p.turnId}`} items={activityItems} />;
        }
        if (it.kind === "done") return null;
        return it.kind === "interaction" && it.interaction && p.onInteractionRespond ? (
          <InteractionCard
            key={it.id}
            threadId={p.threadId}
            payload={it.interaction}
            onRespond={p.onInteractionRespond}
          />
        ) : (
          <Message
            key={it.id}
            align={it.kind === "user" ? "end" : "start"}
            data-item={it.id}
            data-promoted={it.promoted ? "1" : "0"}
          >
            <MessageBody className="max-w-full overflow-x-hidden">
              <Bubble
                variant={it.kind === "user" ? "secondary" : it.kind === "error" ? "destructive" : "ghost"}
                align={it.kind === "user" ? "end" : "start"}
                className={cn(
                  "min-w-0 max-w-full overflow-x-hidden",
                  it.kind !== "user" && "w-full",
                )}
              >
                <BubbleContent
                  className={cn(
                    "w-full min-w-0 max-w-full overflow-x-hidden",
                    it.kind === "thinking_live" && "shimmer",
                  )}
                >
                  {it.kind === "error" && <span className="message-error-label">Erreur</span>}
                  <MessageContent
                    text={it.text || (it.kind === "interaction" ? it.interactionTitle : "") || "…"}
                    markdown={it.kind !== "streaming" && it.kind !== "thinking_live"}
                    collapsible={it.kind !== "user" && it.kind !== "streaming" && it.kind !== "thinking_live"}
                  />
                </BubbleContent>
              </Bubble>
            </MessageBody>
          </Message>
        );
      })}
    </div>
  );
}

export const TurnBlock = memo(TurnBlockInner, (a, b) => {
  if (
    a.turnId !== b.turnId ||
    a.threadId !== b.threadId ||
    a.pinnedStreaming !== b.pinnedStreaming ||
    a.onInteractionRespond !== b.onInteractionRespond
  ) {
    return false;
  }
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const x = a.items[i];
    const y = b.items[i];
    if (
      x.id !== y.id ||
      x.text !== y.text ||
      x.kind !== y.kind ||
      x.promoted !== y.promoted ||
      x.toolStatus !== y.toolStatus ||
      x.toolDurationMs !== y.toolDurationMs ||
      x.interaction?.state !== y.interaction?.state
    ) {
      return false;
    }
  }
  return true;
});
