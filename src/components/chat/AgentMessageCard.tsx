import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { Badge } from "../shadcn/badge";
import { Bubble, BubbleContent } from "../shadcn/bubble";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "../shadcn/message";
import { t } from "../../lib/i18n";

type Props = {
  direction: "sent" | "received";
  peerProvider?: string;
  peerTitle?: string;
  messageKind?: "message" | "report";
  text: string;
  status: string;
  onOpenPeer?: () => void;
};

export function AgentMessageCard({
  direction,
  peerProvider,
  peerTitle,
  text,
  status,
  onOpenPeer,
}: Props) {
  const sent = direction === "sent";
  const peerLabel = peerProvider === "opencode"
    ? "OpenCode"
    : peerProvider
      ? peerProvider.charAt(0).toUpperCase() + peerProvider.slice(1)
      : peerTitle || t("linkedAgent.agentFallback");

  if (sent) {
    if (status === "delivered") return null;
    return (
      <Message align="end" className="tw:my-1" role="status" aria-live="polite">
        <MessageHeader className="tw:justify-end">
          <Badge variant={status === "failed" ? "destructive" : "outline"}>
            {status !== "failed" ? <LoaderCircleIcon className="tw:animate-spin" aria-hidden="true" /> : null}
            {status === "failed"
              ? t("linkedAgent.mentionFailed")
              : t("linkedAgent.consulting", { provider: peerLabel })}
          </Badge>
        </MessageHeader>
      </Message>
    );
  }

  return (
    <Message
      align="start"
      className="tw:my-2"
      role="article"
      aria-label={t("linkedAgent.replyFrom", { provider: peerLabel })}
    >
      <MessageContent>
        <MessageHeader>
          <Badge variant="secondary">
            <SparklesIcon data-icon="inline-start" aria-hidden="true" />
            {peerLabel}
          </Badge>
        </MessageHeader>
        <Bubble variant="tinted" align="start" onClick={onOpenPeer}>
          <BubbleContent>
            <span className="tw:whitespace-pre-wrap">{text}</span>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
