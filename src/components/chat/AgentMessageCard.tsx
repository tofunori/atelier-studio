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
  messageKind,
  text,
  status,
  onOpenPeer,
}: Props) {
  const dirLabel =
    direction === "sent" ? t("linkedAgent.msgSent") : t("linkedAgent.msgReceived");
  const kindLabel =
    messageKind === "report" ? t("linkedAgent.kindReport") : t("linkedAgent.kindMessage");

  return (
    <div
      className="tw my-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--fg)]"
      role="article"
      aria-label={`${dirLabel} ${kindLabel}`}
    >
      <div className="tw mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
        <span className="tw font-medium text-[var(--fg2)]">{dirLabel}</span>
        <span>·</span>
        <span>{kindLabel}</span>
        {peerProvider || peerTitle ? (
          <>
            <span>·</span>
            <button
              type="button"
              className="tw text-[var(--fg2)] underline-offset-2 hover:underline"
              onClick={onOpenPeer}
            >
              {[peerProvider, peerTitle].filter(Boolean).join(" — ")}
            </button>
          </>
        ) : null}
        <span className="tw ml-auto tabular-nums text-[var(--muted2)]">{status}</span>
      </div>
      <div className="tw whitespace-pre-wrap leading-[1.5] text-[var(--fg)]">{text}</div>
    </div>
  );
}
