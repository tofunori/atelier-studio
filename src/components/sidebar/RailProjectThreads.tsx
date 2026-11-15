// Fils récents du projet actif sous sa puce (barre compacte, 2026-11-12,
// option A). Le rail ne montrait aucun fil : avec un ou deux projets, c'est
// pourtant entre les fils qu'on circule. Marques plus petites que les puces
// et rattachées par un filet, pour ne pas se lire comme des projets ni
// comme les chats épinglés du haut.
// Sous-fils (2026-11-15, variante A « Branches ») : chacun sur sa ligne de
// 22 px, en retrait sous son parent ; sa marque est son état (anneau, point
// ambre, point bleu, coche). L'anneau quitte alors le parent.
import { Fragment } from "react";
import { Check } from "lucide-react";
import type { Thread } from "../../lib/ws";
import {
  railChildThreads, rowSignal, type RailChildState, type RailProjectThread,
} from "../../lib/railProjectThreads";
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
  /** « +n » : les sous-fils qui n'ont pas de ligne se voient colonne dépliée */
  onExpand?: () => void;
};

const CHILD_LABEL: Record<RailChildState, string> = {
  running: "En cours",
  queued: "En file",
  waiting: "Attend ta réponse",
  review: "À relire",
  done: "Terminé",
  fail: SIGNAL_LABEL.fail,
};

/** Marque d'un sous-fil : son état, rien d'autre. L'anneau est celui des
 * signaux du rail, la coche celle de la famille Lucide. */
function ChildGlyph({ state }: { state: RailChildState }) {
  if (state === "running") return <RailSignalMark signal="run" />;
  if (state === "done") return <Check className="rail-sub-glyph rail-sub-check" size={12} strokeWidth={1.5} aria-hidden="true" />;
  return <span className={`rail-sub-glyph rail-sub-dot is-${state}`} aria-hidden="true" />;
}

export function RailProjectThreads(p: RailProjectThreadsProps) {
  if (!p.rows.length) return null;
  const now = new Date();
  const name = p.root.split("/").filter(Boolean).pop() ?? p.root;
  return (
    <div className="rail-threads" role="group" aria-label={`Fils récents de ${name}`}>
      {p.rows.map((row) => {
        const { thread, children, at } = row;
        const title = thread.title?.trim() || "Sans titre";
        const family = railChildThreads(row, { activeId: p.activeId, signals: p.signals });
        const signal = rowSignal(row, p.signals, new Set(family.shown.map((child) => child.thread.id)));
        // un sous-fil ouvert prend le fond sur sa ligne ; caché, il le laisse au parent
        const on = thread.id === p.activeId || (children.some((child) => child.id === p.activeId)
          && !family.shown.some((child) => child.thread.id === p.activeId));
        const when = activityText(at, now);
        const state = [signal ? SIGNAL_LABEL[signal] : null, when].filter(Boolean).join(" · ");
        const mark = (
          <Tooltip placement="right"
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
        if (!family.shown.length) return <Fragment key={thread.id}>{mark}</Fragment>;
        return (
          <Fragment key={thread.id}>
            {mark}
            <div className="rail-subthreads" role="group" aria-label={`Fils de « ${title} »`}>
              {family.shown.map(({ thread: child, state: childState }) => {
                const childTitle = child.title?.trim() || "Sans titre";
                const label = CHILD_LABEL[childState];
                const childOn = child.id === p.activeId;
                return (
                  <Tooltip key={child.id} placement="right"
                    label={<span className="rail-tip"><span>{childTitle}</span><span>{`${label} · fil de ${title}`}</span></span>}>
                    <IconButton
                      className={`rail-subthread ${childOn ? "on" : ""}`}
                      label={`${childTitle} — ${label}`}
                      aria-current={childOn ? "page" : undefined}
                      data-state={childState}
                      onClick={() => p.onOpen(child)}>
                      <ChildGlyph state={childState} />
                    </IconButton>
                  </Tooltip>
                );
              })}
              {family.hidden > 0 && p.onExpand && (
                <Tooltip placement="right" label={`${family.hidden} autre${family.hidden > 1 ? "s" : ""} fil${family.hidden > 1 ? "s" : ""} : déplier la barre`}>
                  <IconButton className="rail-subthread rail-sub-more"
                    label={`Déplier la barre pour voir ${family.hidden} autre${family.hidden > 1 ? "s" : ""} fil${family.hidden > 1 ? "s" : ""}`}
                    onClick={p.onExpand}>
                    <span className="rail-sub-count">+{family.hidden}</span>
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
