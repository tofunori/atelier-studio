import { memo, useEffect, useRef } from "react";
import { InteractionCard } from "./InteractionCard.tsx";
import type { InteractionResponse } from "./interactionTypes.ts";
import type { ChatItem } from "./store/types.ts";

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
      className="turn-block"
      data-turn={p.turnId}
      data-streaming={p.pinnedStreaming ? "1" : "0"}
    >
      {p.items.map((it) =>
        it.kind === "interaction" && it.interaction && p.onInteractionRespond ? (
          <InteractionCard
            key={it.id}
            threadId={p.threadId}
            payload={it.interaction}
            onRespond={p.onInteractionRespond}
          />
        ) : (
          <article
            key={it.id}
            className={`msg ${it.kind === "user" ? "msg-user" : ""} ${
              it.kind === "streaming" || it.kind === "thinking_live" ? "msg-stream" : ""
            }`}
            data-item={it.id}
            data-promoted={it.promoted ? "1" : "0"}
          >
            <div className="msg-kind">{it.kind}</div>
            <div className="msg-body">
              {it.kind === "tool" && it.toolName ? (
                <>
                  <strong>{it.toolName}</strong>
                  {it.text ? `\n${it.text}` : ""}
                </>
              ) : (
                it.text || (it.kind === "interaction" ? it.interactionTitle : "") || "…"
              )}
              {(it.kind === "streaming" || it.kind === "thinking_live") && (
                <span className="stream-caret" aria-hidden>
                  ▍
                </span>
              )}
            </div>
          </article>
        ),
      )}
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
      x.interaction?.state !== y.interaction?.state
    ) {
      return false;
    }
  }
  return true;
});
