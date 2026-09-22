import { useMemo, useState } from "react";
import type { Thread } from "../lib/ws";
import type { HighlightEntry, ProjMeta } from "./Rail";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui";
import { CloseIcon, DownloadIcon, HighlighterIcon, SidebarIcon } from "./icons";
import { t } from "../lib/i18n";
import { hlRelativeDate } from "../lib/highlightsStore";

// panneau de la vue « Surlignés » (lot 2) : carnet de cartes autonomes — cf.
// docs/superpowers/specs/2026-07-08-surlignes-lot2.md §4. Chaque fiche est
// déjà une photographie complète (texte, contexte, projet, chat, provider,
// date) : ce panneau ne fait QUE filtrer/trier/afficher, jamais de lookup
// live dans un chat pour reconstituer une donnée manquante.
export function HighlightsPanel(p: {
  highlights: HighlightEntry[];
  threads: Thread[];
  projMeta: Record<string, ProjMeta>;
  filterProject: string | null;
  onSetFilterProject: (root: string | null) => void;
  onRemove: (id: string) => void;
  onOpenChat: (threadId: string, projectRoot: string) => void;
  onExport: () => void;
  onCompact: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; projectRoot: string; projectName: string; count: number }>();
    for (const h of p.highlights) {
      const key = h.projectRoot || h.projectName || "";
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, projectRoot: h.projectRoot, projectName: h.projectName, count: 1 });
    }
    return [...map.values()];
  }, [p.highlights]);
  const filtered = p.filterProject != null
    ? p.highlights.filter((h) => (h.projectRoot || h.projectName || "") === p.filterProject)
    : p.highlights;

  return (
    <div className="sidebar hl-panel">
      <div className="side-top" data-tauri-drag-region>
        <span className="flex" />
        <IconButton className="mini compact-btn" label={t("action.collapse-sidebar")} title={t("action.collapse-sidebar")} onClick={p.onCompact}>
          <SidebarIcon size={17} />
        </IconButton>
      </div>
      <div className="hl-head">
        <span className="hl-head-title">{t("view.highlights")}</span>
        <span className="hl-count">{p.highlights.length}</span>
        <IconButton className="mini hl-export-btn" label={t("highlights.export")} title={t("highlights.export")}
          disabled={!p.highlights.length} onClick={p.onExport}>
          <DownloadIcon size={15} />
        </IconButton>
      </div>
      {!!groups.length && (
        <div className="hl-chips">
          <RowButton className={`chip ${p.filterProject == null ? "on" : ""}`}
            onClick={() => p.onSetFilterProject(null)}>
            {t("highlights.all-count", { n: p.highlights.length })}
          </RowButton>
          {groups.map((g) => (
            <RowButton key={g.key} className={`chip ${p.filterProject === g.key ? "on" : ""}`}
              onClick={() => p.onSetFilterProject(p.filterProject === g.key ? null : g.key)}>
              <span className="hl-dot" style={{ background: p.projMeta[g.projectRoot]?.color || "var(--mark-neutral)" }} />
              {g.projectName || t("highlights.no-project")} · {g.count}
            </RowButton>
          ))}
        </div>
      )}
      {filtered.length ? (
        <div className="hl-list side-scroll">
          {filtered.map((h) => {
            const open = openId === h.id;
            const threadAlive = !!h.threadId && p.threads.some((th) => th.id === h.threadId);
            return (
              <div key={h.id} className={`hl-card ${h.kind} ${open ? "open" : ""}`}
                onClick={() => setOpenId(open ? null : h.id)}>
                <div className="hl-text">{h.text}</div>
                {open && h.context && <div className="hl-context">{h.context}</div>}
                {open && threadAlive && (
                  <Button variant="ghost" className="hl-open-chat"
                    onClick={(e) => { e.stopPropagation(); p.onOpenChat(h.threadId, h.projectRoot); }}>
                    {t("highlights.open-chat")}
                  </Button>
                )}
                <div className="hl-foot">
                  <span className="hl-dot" style={{ background: p.projMeta[h.projectRoot]?.color || "var(--mark-neutral)" }} />
                  <span className="hl-proj">{h.projectName || t("highlights.no-project")}</span>
                  <span className="hl-time">{hlRelativeDate(h.createdAt)}</span>
                  <IconButton size="s" className="hl-remove" label={t("highlights.remove")} title={t("highlights.remove")}
                    onClick={(e) => { e.stopPropagation(); p.onRemove(h.id); }}>
                    <CloseIcon size={11} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="view-placeholder">
          <HighlighterIcon size={22} />
          <p>{t("highlights.empty")}</p>
        </div>
      )}
    </div>
  );
}
