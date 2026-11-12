// Fils récents du projet actif sous sa puce (barre compacte, 2026-11-12,
// option A). Le rail ne montrait aucun fil : avec un ou deux projets, c'est
// pourtant entre les fils qu'on circule. Marques plus petites que les puces
// et rattachées par un filet, pour ne pas se lire comme des projets ni
// comme les chats épinglés du haut.
import type { Thread } from "../../lib/ws";
import { rowSignal, type RailProjectThread } from "../../lib/railProjectThreads";
import { SIGNAL_LABEL, type RailSignal } from "../../lib/railSignals";
import { activityText } from "../../lib/projectsHomeText";
import { ChatSeal, chatSealFor } from "./ChatSeal";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import { RailSignalMark } from "../RailSignalMark";

export type RailProjectThreadsProps = {
  root: string;
  /** railProjectThreads() : calculé par le rail, qui en déduit le coin de la puce */
  rows: RailProjectThread[];
  /** fil affiché dans le chat (null : une autre vue) */
  activeId: string | null;
  signals?: Record<string, RailSignal>;
  seals?: Record<string, string>;
  onOpen: (thread: Thread) => void;
};

export function RailProjectThreads(p: RailProjectThreadsProps) {
  if (!p.rows.length) return null;
  const now = new Date();
  const name = p.root.split("/").filter(Boolean).pop() ?? p.root;
  return (
    <div className="rail-threads" role="group" aria-label={`Fils récents de ${name}`}>
      {p.rows.map((row) => {
        const { thread, children, at } = row;
        const title = thread.title?.trim() || "Sans titre";
        const signal = rowSignal(row, p.signals);
        const on = thread.id === p.activeId || children.some((child) => child.id === p.activeId);
        const when = activityText(at, now);
        const state = [signal ? SIGNAL_LABEL[signal] : null, when].filter(Boolean).join(" · ");
        return (
          <Tooltip key={thread.id} placement="right"
            label={<span className="rail-tip">{[title, state].filter(Boolean).map((line, i) => <span key={i}>{line}</span>)}</span>}>
            <IconButton
              className={`rail-thread ${on ? "on" : ""}`}
              label={state ? `${title} — ${state}` : title}
              aria-current={on ? "page" : undefined}
              data-signal={signal ?? undefined}
              onClick={() => p.onOpen(thread)}>
              <ChatSeal seal={chatSealFor(thread.id, p.seals)} />
              <RailSignalMark signal={signal} />
            </IconButton>
          </Tooltip>
        );
      })}
    </div>
  );
}
