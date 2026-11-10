// Boîte « À traiter » du rail (piste B, 2026-10-21) : un seul endroit pour
// tout ce qui réclame un geste — autorisation ou question en attente, tour
// en échec, réponse non lue, conversion d'article échouée. Les puces du rail
// disent OÙ ; la boîte dit QUOI, et y mène en un clic. Chargée à part de
// l'entrée (budget JS plein, cf. scripts/check_entry_budget.mts).
import { useState, useSyncExternalStore } from "react";
import { articleImportSnapshot, subscribeArticleImport } from "../lib/articleImports";
import { useIntegrations } from "../lib/integrations";
import type { AttentionMap, RailSignal } from "../lib/railSignals";
import type { Thread } from "../lib/ws";
import { Popover, PopoverTrigger } from "./ui/Popover";
import { MenuPanelContent } from "./ui/MenuPanel";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui/RowButton";
import RailInboxPanel from "./RailInboxPanel";

import { InboxIcon } from "lucide-react";
export type RailInboxProps = {
  /** signal de chaque fil (même source que les puces) */
  signals: Record<string, RailSignal>;
  threads: readonly Thread[];
  attention: AttentionMap;
  unread: ReadonlySet<string>;
  activeId: string | null;
  onOpen: (threadId: string) => void;
  onMarkAllRead: () => void;
  /** « row » : rangée nommée de la colonne latérale (variante A, 2026-11-08) */
  variant?: "rail" | "row";
  /** libellé visible de la rangée */
  rowLabel?: string;
};

function InboxGlyph({ size }: { size: number }) {
  return (
    <InboxIcon size={size} />
  );
}

type TriggerState = { open: boolean; label: string; count: number; waiting: boolean };

/** Déclencheur de la boîte : bouton-icône du rail, ou rangée nommée de la
 *  colonne latérale. Rendu par PopoverTrigger, qui y greffe ref et handlers. */
function inboxTrigger(variant: RailInboxProps["variant"], rowLabel: string | undefined, s: TriggerState) {
  const wait = s.waiting ? "wait" : "";
  if (variant === "row") {
    return (
      <RowButton className={`scol-row ${s.open ? "on" : ""}`} aria-label={s.label} title={s.label}
        aria-haspopup="dialog" aria-expanded={s.open}>
        <span className="scol-row-ico"><InboxGlyph size={14} /></span>
        <span className="scol-row-label">{rowLabel ?? "À traiter"}</span>
        {s.count > 0 && <span className={`scol-count ${wait}`} aria-hidden="true">{s.count > 99 ? "99+" : s.count}</span>}
      </RowButton>
    );
  }
  return (
    <IconButton className={`rail-btn rail-inbox-btn ${s.open ? "on" : ""}`} label={s.label} title={s.label}
      aria-haspopup="dialog" aria-expanded={s.open}>
      <InboxGlyph size={19} />
      {s.count > 0 && <span className={`rail-count ${wait}`} aria-hidden="true">{s.count > 9 ? "9+" : s.count}</span>}
    </IconButton>
  );
}

export default function RailInbox(p: RailInboxProps) {
  const [open, setOpen] = useState(false);
  const imports = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot);
  const ragdocOn = useIntegrations().effective.ragdoc;
  const articleFailures = ragdocOn ? imports.jobs.filter((job) => job.phase === "error").length : 0;
  const signals = Object.values(p.signals);
  const count = signals.filter((signal) => signal !== "run").length + articleFailures;
  const waiting = signals.includes("wait");
  const label = count
    ? `À traiter — ${count} élément${count > 1 ? "s" : ""}`
    : "À traiter — rien en attente";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={inboxTrigger(p.variant, p.rowLabel, { open, label, count, waiting })} />
      <MenuPanelContent className="rail-inbox" side="right" align="start" sideOffset={8} aria-label="À traiter">
        {open && <RailInboxPanel {...p} ragdocOn={ragdocOn} jobs={imports.jobs} onClose={() => setOpen(false)} />}
      </MenuPanelContent>
    </Popover>
  );
}
