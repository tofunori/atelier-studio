// Fil rangé sous la conversation qui l'a lancé (coordinateur et fils,
// 2026-11-09). En retrait sous le titre du parent, deux lignes comme lui :
// fournisseur et titre, puis l'état en toutes lettres (En cours, Attend ta
// réponse, À relire…). Le
// clic ouvre le fil à la place du chat ; il n'a pas d'onglet à lui.
import { t } from "../../lib/i18n";
import type { DelegatedState } from "../../lib/threadLinks";
import type { Thread } from "../../lib/ws";
import { ProviderIcon } from "../icons";
import { SidebarMenuButton, SidebarMenuItem } from "../shadcn/sidebar";
import { IconButton, Spinner } from "../ui";
import { LazyDropdownMenu, type LazyDropdownMenuItem } from "../ui/LazyDropdownMenu";

const STATE_KEYS = {
  running: "sidebar.child.running",
  queued: "sidebar.child.queued",
  waiting: "sidebar.child.waiting",
  review: "sidebar.child.review",
  done: "sidebar.child.done",
} as const;

export function ChildThreadRow(p: {
  thread: Thread;
  title: string;
  state: DelegatedState;
  active: boolean;
  unread: boolean;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  menuItems: LazyDropdownMenuItem[];
}) {
  const stateLabel = t(STATE_KEYS[p.state]);
  return (
    <SidebarMenuItem
      className={"pnav-row pnav-child" + (p.active ? " active" : "") + (p.menuOpen ? " menu-open" : "")}
      data-state={p.state}
    >
      <SidebarMenuButton
        type="button"
        size="default"
        isActive={p.active}
        className="pnav-row-main"
        aria-current={p.active ? "true" : undefined}
        aria-label={`${p.title} — ${stateLabel}`}
        title={p.title}
        onClick={p.onOpen}
        onContextMenu={p.onContextMenu}
      >
        <span className="pnav-row-copy">
          <span className="pnav-title-row">
            <span className="prov-ico" aria-hidden="true">
              <ProviderIcon provider={p.thread.provider} size={12} />
            </span>
            <span className="title">
              {p.unread && <span className="unread-dot" />}
              {p.title}
            </span>
          </span>
          <span className="pnav-meta" aria-hidden="true">
            <span className="pnav-meta-item pnav-child-state">
              {p.state === "running" ? <Spinner className="arc" size={10} label={stateLabel} /> : null}
              {stateLabel}
            </span>
          </span>
        </span>
      </SidebarMenuButton>
      <span className="pnav-row-end">
        <LazyDropdownMenu
          open={p.menuOpen}
          onOpenChange={p.onMenuOpenChange}
          label={t("thread.more-actions")}
          align="end"
          className="pnav-thread-menu"
          trigger={
            <IconButton size="s" label={t("thread.more-actions")} className="pnav-act" aria-haspopup="menu">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="3.2" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12.8" cy="8" r="1" />
              </svg>
            </IconButton>
          }
          items={p.menuItems}
        />
      </span>
    </SidebarMenuItem>
  );
}
