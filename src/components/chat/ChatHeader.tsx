// En-tête local du Chat (plan 018, étape 2 — surface pilote 1).
// Contrat : ≤ 2 lignes (eyebrow projet + UN titre tronqué au nom accessible
// complet), zone statut (méta provider + StatusBadge) séparée de l'action
// overflow, ≤ 3 actions visibles. Aucune logique métier ici : le renommage
// reste le workflow existant côté App (callback onRename).
import { useRef, useState } from "react";
import { Button, IconButton, StatusBadge, SurfaceHeader, Tooltip } from "../ui";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../shadcn/popover";
import { Separator } from "../shadcn/separator";
import { SessionBridgeIcon } from "../icons";
import { t } from "../../lib/i18n";
import type { PresentedStatus } from "../../lib/statusPresentation";
import "../../styles/local-headers.css";


export function ChatHeader(p: {
  /** Titre du thread (record) — tronqué par CSS, nom complet via title=. */
  title: string;
  /** "claude" | "codex" | … — méta discrète à côté du badge. */
  provider: string;
  projectName: string | null;
  /** Chemin complet : info-bulle/nom accessible de l'eyebrow. */
  projectPath?: string | null;
  status: PresentedStatus | null;
  /** Ouvre le renommage (workflow existant côté App) ; absent = pas d'overflow. */
  onRename?: (() => void) | null;
  linkedAgents?: {
    id: string;
    provider: string;
    title: string;
    paused: boolean;
    direction: "parent" | "child";
  }[];
  onOpenLinkedAgent?: (threadId: string) => void;
  onUnlinkLinkedAgent?: (threadId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // triggerRef transmis à LazyDropdownMenu (Base UI gère dismiss et focus)
  const moreAnchor = useRef<HTMLButtonElement | null>(null);

  const status = p.status;
  // « idle » n'est pas un état à montrer : le badge n'existe que pour un
  // record vivant (running/done/warning/error/…).
  const badge = status != null && status.kind !== "idle" ? status : null;
  const linkedParents = p.linkedAgents?.filter((agent) => agent.direction === "parent") ?? [];
  const linkedChildren = p.linkedAgents?.filter((agent) => agent.direction === "child") ?? [];

  const linkedGroup = (
    label: string,
    agents: NonNullable<typeof p.linkedAgents>,
  ) => agents.length ? (
    <section className="tw:flex tw:flex-col tw:gap-1" aria-label={label}>
      <p className="tw:px-2 tw:pt-1 tw:text-[length:var(--fs-caption)] tw:font-medium tw:uppercase tw:tracking-[0.08em] tw:text-muted-foreground">
        {label}
      </p>
      {agents.map((agent) => (
        <div key={agent.id} className="tw:flex tw:items-center tw:gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="tw:min-w-0 tw:flex-1 tw:justify-start"
            onClick={() => p.onOpenLinkedAgent?.(agent.id)}
          >
            <span className="tw:truncate">{agent.provider} · {agent.title}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("linkedConversation.unlinkNamed", { provider: agent.provider })}
            onClick={() => p.onUnlinkLinkedAgent?.(agent.id)}
          >
            {t("linkedConversation.unlink")}
          </Button>
        </div>
      ))}
    </section>
  ) : null;

  return (
    // eyebrow projet supprimé (demande Thierry 2026-07-10) : l'identité
    // projet ne vit qu'au crumb de la TopBar
    <SurfaceHeader
      className="chat-surface-header"
      // SurfaceHeader ne propage aucun attribut title : wrapper span pour
      // exposer le nom complet du titre que le CSS .title tronque.
      title={<span title={p.title}>{p.title}</span>}
      actions={
        <>
          {/* demande Thierry (2026-07-10) : pas de méta provider dans
              l'en-tête — le provider est visible dans le composer */}
          {badge != null && (
            <StatusBadge status={badge.tone} title={badge.a11y}>
              {badge.label}
            </StatusBadge>
          )}
          {p.linkedAgents?.length ? (
            <Popover>
              <Tooltip label={t("linkedConversation.title")} placement="bottom">
                <PopoverTrigger
                  render={
                    <IconButton
                      label={t("linkedConversation.title")}
                      aria-haspopup="dialog"
                    >
                      <SessionBridgeIcon />
                    </IconButton>
                  }
                />
              </Tooltip>
              <PopoverContent align="end" className="tw:w-72">
                <PopoverHeader>
                  <PopoverTitle>{t("linkedConversation.title")}</PopoverTitle>
                </PopoverHeader>
                <div className="tw:flex tw:flex-col tw:gap-2">
                  {linkedGroup(t("linkedConversation.createdFrom"), linkedParents)}
                  {linkedGroup(t("linkedConversation.continuesTo"), linkedChildren)}
                </div>
                <Separator />
                <p className="tw:text-[length:var(--fs-caption)] tw:text-muted-foreground">
                  {t("linkedConversation.unlinkKeepsChats")}
                </p>
              </PopoverContent>
            </Popover>
          ) : null}
          {p.onRename != null && (
            <LazyDropdownMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              triggerRef={moreAnchor}
              align="end"
              label={t("action.more")}
              trigger={
                <IconButton
                  label={t("action.more")}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="3.5" cy="8" r="1.15" /><circle cx="8" cy="8" r="1.15" /><circle cx="12.5" cy="8" r="1.15" />
                  </svg>
                </IconButton>
              }
              items={[{ key: "rename", label: t("action.rename"), onSelect: p.onRename }]}
            />
          )}
        </>
      }
    />
  );
}
