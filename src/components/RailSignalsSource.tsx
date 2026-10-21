// Calcule les signaux du rail hors de l'entrée (budget JS plein) : abonné au
// store d'événements, il ne remonte à App que ce qui change vraiment.
import { useEffect, useMemo, useRef } from "react";
import { isDiscussionContext } from "../lib/discussions";
import { summarizeRail, useThreadAttention, type AttentionMap, type RailSignalSummary } from "../lib/railSignals";
import type { ThreadEvents } from "../lib/threadEventStore";
import type { Thread } from "../lib/ws";

export type RailView = { signals: RailSignalSummary; attention: AttentionMap };

export default function RailSignalsSource(p: {
  store: { subscribeAll: (listener: () => void) => () => void; getCommittedSnapshot: () => ThreadEvents };
  threads: readonly Thread[];
  unread: ReadonlySet<string>;
  activeId: string | null;
  onChange: (view: RailView) => void;
}) {
  const attention = useThreadAttention(p.store);
  const signals = useMemo(
    () => summarizeRail(p.threads, attention, p.unread, p.activeId, isDiscussionContext),
    [p.threads, attention, p.unread, p.activeId],
  );
  const sent = useRef<{ key: string; attention: AttentionMap } | null>(null);
  const { onChange } = p;
  useEffect(() => {
    // la liste des fils change d'identité à chaque mise à jour : on ne
    // redessine App que si ce que montre le rail a changé
    const key = JSON.stringify(signals);
    if (sent.current?.key === key && sent.current.attention === attention) return;
    sent.current = { key, attention };
    onChange({ signals, attention });
  }, [signals, attention, onChange]);
  return null;
}
