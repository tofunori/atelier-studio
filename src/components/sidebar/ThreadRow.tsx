// Ligne de conversation du Research Navigator (plan 024, étape 5).
// Sémantique : un bouton natif principal (ouvrir / renommer / menu contextuel)
// + boutons d'actions SIBLINGS (jamais imbriqués). La colonne de fin réserve
// en permanence 48 px : heure et actions partagent ce slot et se cross-fadent
// au hover ou focus-within — aucun display:none, aucun layout shift.
import { t } from "../../lib/i18n";
import type { ConversationFamily } from "../../lib/threadLinks";
import type { Thread } from "../../lib/ws";
import { ProviderIcon } from "../icons";
import { Input } from "../shadcn/input";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "../shadcn/sidebar";
import { IconButton } from "../ui";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "../ui/LazyDropdownMenu";
import { presentStatus } from "../../lib/statusPresentation";
import { Clock3Icon } from "lucide-react";
import { ConversationFamilyMarker } from "./ConversationFamilyMarker";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function shortTime(value?: string): string {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return "";
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}j`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return `${Math.floor(d / 30)}mo`;
}

function relativeDate(value?: string): string {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("time.just-now");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("time.minutes-ago", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("time.hours-ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.yesterday");
  if (days < 7) return `${days} j`;
  return new Date(ts).toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  );
}

function MoreGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.2" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12.8" cy="8" r="1" />
    </svg>
  );
}

export function ThreadRow(p: {
  thread: Thread;
  kind: "pinned" | "conversation";
  title: string;
  rawTitle: string;
  active: boolean;
  selected: boolean;
  unread: boolean;
  heartbeat: boolean;
  linkedConversationCount?: number;
  family?: ConversationFamily;
  familyPreviewed?: boolean;
  onOpenFamilyThread: (thread: Thread) => void;
  onUnlinkFamilyThread?: (childThreadId: string) => void;
  onFamilyPreviewChange: (familyId: string, previewed: boolean) => void;
  favorite: boolean;
  editing: boolean;
  editText: string;
  editRef?: React.Ref<HTMLInputElement>;
  onEditChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onRowClick: (e: React.MouseEvent) => void;
  onRowDoubleClick: () => void;
  /** clic droit — le parent ancre le menu sur e.currentTarget */
  onRowContextMenu: (e: React.MouseEvent) => void;
  onToggleFavorite: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  menuItems: LazyDropdownMenuItem[];
}) {
  const running = p.thread.status === "running";
  const status = presentStatus({ kind: running ? "running" : p.thread.status === "done" ? "done" : "idle" });
  const a11ySuffix = [
    p.unread ? t("sidebar.unread") : null,
    p.heartbeat ? t("automations.heartbeat-active") : null,
    p.linkedConversationCount
      ? t("linkedConversation.relatedCount", { count: p.linkedConversationCount })
      : null,
    running ? status.label : null,
  ].filter(Boolean);

  return (
    <SidebarMenuItem
      className={cx(
        "pnav-row",
        p.active && "active",
        p.selected && "multi-sel",
        p.familyPreviewed && "family-preview",
      )}
      data-family-id={p.family?.id}
    >
      {p.editing ? (
        <Input
          ref={p.editRef}
          className="rename"
          value={p.editText}
          onChange={(e) => p.onEditChange(e.target.value)}
          onBlur={p.onEditCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") p.onEditCommit();
            if (e.key === "Escape") p.onEditCancel();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <SidebarMenuButton
          type="button"
          size="default"
          isActive={p.active}
          className="pnav-row-main"
          aria-current={p.active ? "true" : undefined}
          aria-label={a11ySuffix.length ? `${p.title} — ${a11ySuffix.join(" — ")}` : undefined}
          title={p.rawTitle}
          onClick={p.onRowClick}
          onDoubleClick={p.onRowDoubleClick}
          onContextMenu={p.onRowContextMenu}
        >
          <span className="prov-ico" aria-hidden="true">
            <ProviderIcon provider={p.thread.provider} />
          </span>
          <span className="pnav-row-copy">
            <span className="pnav-title-row">
              <span className="title">
                {p.unread && <span className="unread-dot" />}
                {p.title}
              </span>
              {p.heartbeat && (
                <Clock3Icon className="pnav-heartbeat" aria-hidden="true" />
              )}
            </span>
          </span>
        </SidebarMenuButton>
      )}
      <span className={cx("pnav-row-end", p.family && "has-family")}>
        {p.family ? (
          <ConversationFamilyMarker
            family={p.family}
            currentThreadId={p.thread.id}
            onOpenThread={p.onOpenFamilyThread}
            onUnlinkThread={p.onUnlinkFamilyThread}
            onPreviewChange={p.onFamilyPreviewChange}
          />
        ) : null}
        <span className="row-status">
          {running ? (
            <svg className="arc" role="img" aria-label={status.label} width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="var(--border2)" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="row-time" aria-label={relativeDate(p.thread.updatedAt)}>
              {shortTime(p.thread.updatedAt)}
            </span>
          )}
        </span>
        <span className="row-actions">
          <IconButton
            size="s"
            label={p.favorite ? t("action.remove-favorite") : t("action.add-favorite")}
            className={cx("pnav-act", p.favorite && "on")}
            onClick={p.onToggleFavorite}
          >
            <StarGlyph filled={p.favorite} />
          </IconButton>
          <LazyDropdownMenu
            open={p.menuOpen}
            onOpenChange={p.onMenuOpenChange}
            label={t("thread.more-actions")}
            align="end"
            className="pnav-thread-menu"
            trigger={
              <IconButton
                size="s"
                label={t("thread.more-actions")}
                className="pnav-act"
                aria-haspopup="menu"
                onClick={p.onOpenMenu}
              >
                <MoreGlyph />
              </IconButton>
            }
            items={p.menuItems}
          />
        </span>
      </span>
    </SidebarMenuItem>
  );
}
