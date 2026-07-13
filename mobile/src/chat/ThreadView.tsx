import { eventPreviewText } from "../transport/gatewayClient.ts";
import type { WireEvent } from "../transport/types.ts";
import { MessageContent } from "./MessageContent.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Bubble, BubbleContent } from "@/components/ui/bubble.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import {
  Message,
  MessageContent as MessageBody,
  MessageHeader,
} from "@/components/ui/message.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeftIcon } from "lucide-react";

type Props = {
  threadId: string;
  title?: string;
  events: WireEvent[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
};

export function ThreadView(p: Props) {
  return (
    <div className="screen">
      <Button type="button" variant="ghost" size="sm" onClick={p.onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        Conversations
      </Button>
      <h1 className="screen-title">{p.title || p.threadId}</h1>
      {p.loading && <Skeleton className="h-24 w-full" aria-label="Chargement de l'historique" />}
      {p.error && (
        <Alert variant="destructive"><AlertDescription>{p.error}</AlertDescription></Alert>
      )}
      {!p.loading && p.events.length === 0 && !p.error && (
        <Empty><EmptyHeader><EmptyTitle>Aucun message</EmptyTitle></EmptyHeader></Empty>
      )}
      <div className="flex flex-col gap-3">
        {p.events.map((ev, i) => {
          const key = ev.meta?.eventId ?? `${ev.kind}-${i}`;
          const isUser = ev.kind === "user";
          return (
            <Message
              key={key}
              align={isUser ? "end" : "start"}
              aria-label={`${ev.kind}`}
            >
              <MessageBody>
                <MessageHeader>{ev.kind}</MessageHeader>
                <Bubble variant={isUser ? "secondary" : "ghost"} align={isUser ? "end" : "start"}>
                  <BubbleContent>
                    <MessageContent text={eventPreviewText(ev)} collapsible={!isUser} markdown={!isUser} />
                  </BubbleContent>
                </Bubble>
              </MessageBody>
            </Message>
          );
        })}
      </div>
    </div>
  );
}
