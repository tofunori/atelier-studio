import { t } from "../../lib/i18n";
import type { Thread } from "../../lib/ws";

type Props = {
  thread: Thread;
  parent?: Thread | null;
  onOpenPeer?: (threadId: string) => void;
};

export function LinkedAgentCapsule({ thread, parent, onOpenPeer }: Props) {
  const link = thread.agentLink;
  if (!link) return null;

  const peerId = link.parentThreadId;
  const peerProvider = parent?.provider ?? "parent";
  const label = t("linkedAgent.capsuleLinkedTo", { provider: peerLabel(peerProvider) });
  let statusKey:
    | "linkedAgent.statusActive"
    | "linkedAgent.statusPaused"
    | "linkedAgent.statusBudget"
    | "linkedAgent.statusOrphan" = "linkedAgent.statusActive";
  if (link.paused) statusKey = "linkedAgent.statusPaused";
  else if (link.autoDeliveryUsed >= link.autoDeliveryLimit) statusKey = "linkedAgent.statusBudget";
  else if (!parent) statusKey = "linkedAgent.statusOrphan";

  return (
    <button
      type="button"
      className="tw inline-flex max-w-full items-center gap-2 rounded-[999px] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--fg2)] shadow-[var(--elevation-overlay)] transition-opacity duration-150 hover:opacity-90"
      onClick={() => onOpenPeer?.(peerId)}
      title={t(statusKey)}
      aria-label={`${label} — ${t(statusKey)}`}
    >
      <span className="tw truncate font-medium">{label}</span>
      <span className="tw text-[var(--muted)]">·</span>
      <span className="tw text-[var(--muted)]">{t(statusKey)}</span>
    </button>
  );
}

function peerLabel(provider: string): string {
  switch (provider) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "kimi":
      return "Kimi";
    case "grok":
      return "Grok";
    case "opencode":
      return "OpenCode";
    default:
      return provider;
  }
}
