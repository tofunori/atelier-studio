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
import RailInboxPanel from "./RailInboxPanel";

export type RailInboxProps = {
  /** signal de chaque fil (même source que les puces) */
  signals: Record<string, RailSignal>;
  threads: readonly Thread[];
  attention: AttentionMap;
  unread: ReadonlySet<string>;
  activeId: string | null;
  onOpen: (threadId: string) => void;
  onMarkAllRead: () => void;
};

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
      <PopoverTrigger
        render={
          <IconButton className={`rail-btn rail-inbox-btn ${open ? "on" : ""}`} label={label} title={label}
            aria-haspopup="dialog" aria-expanded={open}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 9.5 4.3 3.8a1 1 0 0 1 .95-.7h5.5a1 1 0 0 1 .95.7l1.8 5.7v2.7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
              <path d="M2.5 9.5h3.2l.8 1.6h3l.8-1.6h3.2" />
            </svg>
            {count > 0 && (
              <span className={`rail-count ${waiting ? "wait" : ""}`} aria-hidden="true">{count > 9 ? "9+" : count}</span>
            )}
          </IconButton>
        }
      />
      <MenuPanelContent className="rail-inbox" side="right" align="start" sideOffset={8} aria-label="À traiter">
        {open && <RailInboxPanel {...p} ragdocOn={ragdocOn} jobs={imports.jobs} onClose={() => setOpen(false)} />}
      </MenuPanelContent>
    </Popover>
  );
}
