import { LoaderCircleIcon, PauseIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui";
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
  /** Relance un message retenu (budget d'échanges atteint ou lien en pause). */
  onContinue?: () => void;
};

/** Pastille « en pause » + Continuer : avant le 2026-10-21, un message retenu
 *  par le budget affichait « … réfléchit » en tournant pour toujours. */
function PausedRow({ name, onContinue }: { name: string; onContinue?: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="tw:flex tw:flex-col tw:items-end tw:gap-1">
      <div className="tw:flex tw:items-center tw:gap-2">
        <Badge variant="outline">
          <PauseIcon aria-hidden="true" />
          {t("linkedAgent.pausedNamed", { name })}
        </Badge>
        {onContinue ? (
          <Button
            variant="secondary"
            size="sm"
            loading={sent}
            onClick={() => { setSent(true); onContinue(); }}
          >
            <PlayIcon aria-hidden="true" />
            {t("linkedAgent.continue")}
          </Button>
        ) : null}
      </div>
      <span className="tw:text-right tw:text-[length:var(--fs-label)] tw:text-muted-foreground">
        {t("linkedAgent.pausedHint")}
      </span>
    </div>
  );
}

export function AgentMessageCard({
  direction,
  peerProvider,
  peerTitle,
  text,
  status,
  onOpenPeer,
  onContinue,
}: Props) {
  const sent = direction === "sent";
  const peerLabel = peerProvider === "opencode"
    ? "OpenCode"
    : peerProvider
      ? peerProvider.charAt(0).toUpperCase() + peerProvider.slice(1)
      : peerTitle || t("linkedAgent.agentFallback");
  // Un fil délégué s'appelle « NomCourt · tâche » : la pastille garde le nom.
  const pausedName = peerTitle?.split(" · ")[0] || peerLabel;

  if (sent) {
    if (status === "delivered") return null;
    if (status === "paused") {
      return (
        <Message align="end" className="tw:my-1" role="status" aria-live="polite">
          <PausedRow name={pausedName} onContinue={onContinue} />
        </Message>
      );
    }
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
        {status === "paused" ? <PausedRow name={pausedName} onContinue={onContinue} /> : null}
      </MessageContent>
    </Message>
  );
}
