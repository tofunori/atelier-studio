// Header du Research Navigator (plan 024, étape 3 ; refonte « deux lignes »
// du 2026-11-02) — identité du projet actif et actions rares dans un
// overflow sur la première ligne ; recherche locale toujours visible et
// « Nouveau chat » en bouton-icône relief sur la seconde. Le nom ouvre le
// menu des projets (récents, écran des projets, ouvrir un dossier, nouveau
// projet — maquette « bureau » du 2026-11-08), en plus du rail.
import { useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { Button, IconButton, RowButton } from "../ui";
import { SearchField } from "../ui/SearchField";
import { LazyDropdownMenu } from "../ui/LazyDropdownMenu";
import { PlusIcon, ChatsIcon, SidebarIcon } from "../icons";
import { ProjIcon } from "./projectIcons";
import type { ProjectStyleAnchor } from "./ProjectStyleMenu";

import { ChevronDownIcon, EllipsisIcon } from "lucide-react";
export type ProjMetaLite = { color?: string; label?: string };

/** Menu du nom du projet (fourni par App). */
export type ProjectSwitchMenu = {
  recents: { root: string; name: string }[];
  onSelect: (root: string) => void;
  onAll: () => void;
  onOpenFolder: () => void;
  onNew: () => void;
};

function ChevronGlyph() {
  return (
    <ChevronDownIcon size={12} />
  );
}

/** Troncature milieu des chemins (contrat typo §6) — valeur complète en title. */
export function middleTruncate(value: string, max = 34): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) * 0.4);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function OverflowGlyph() {
  return (
    <EllipsisIcon size={14} />
  );
}

export function ProjectHeader(p: {
  mode: "project" | "unscoped";
  /** nom affiché — basename du root ou label de projMeta */
  name: string;
  /** chemin complet du projet ; null en mode chats sans projet */
  root: string | null;
  meta?: ProjMetaLite;
  query: string;
  onQueryChange: (q: string) => void;
  onNew: () => void;
  onOpenResume: (provider: "claude" | "codex", anchor?: Element | null) => void;
  onRevealFinder?: () => void;
  /** ouvre le popover couleur/icône, ancré sous le bouton overflow */
  onCustomize?: (anchor: ProjectStyleAnchor) => void;
  onRemoveProject?: () => void;
  onProjectSettings?: () => void;
  switchMenu?: ProjectSwitchMenu;
  /** colonne unifiée : replie la colonne en rail d'icônes */
  onCollapse?: () => void;
  /** colonne unifiée : la tuile du projet ramène à son accueil (rôle tenu
   *  par le re-clic du projet actif dans le rail) */
  onHome?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const nameRef = useRef<HTMLButtonElement | null>(null);
  // triggerRef transmis au menu Base UI (dismiss et retour focus gérés là)
  const overflowRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function customizeAnchor(): ProjectStyleAnchor {
    const element = overflowRef.current;
    if (element) return element;
    return { x: 60, y: 80 };
  }

  const icon = p.meta?.label?.startsWith("icon:") ? (
    <ProjIcon name={p.meta.label.slice(5)} size={14} />
  ) : p.meta?.label ? (
    <span className="pnav-id-letter">{p.meta.label}</span>
  ) : p.mode === "project" && p.onCollapse ? (
    // colonne unifiée : initiale monochrome dans la tuile, jamais une pastille de couleur
    <span className="pnav-id-letter">{p.name.charAt(0).toUpperCase()}</span>
  ) : p.mode === "project" ? (
    <span className="proj-dot" style={{ background: p.meta?.color ?? "var(--mark-neutral)" }} />
  ) : (
    <ChatsIcon size={14} />
  );

  return (
    <header className="pnav-header">
      {/* identité projet UNE seule fois dans l'app, ici (audit SHELL-04 :
          la barre du haut n'a plus de crumb) ; le chemin complet en infobulle. */}
      <div className="pnav-id">
        {p.onHome && p.mode === "project" ? (
          <IconButton label={t("project.home")} title={t("project.home")} className="pnav-id-ico pnav-home"
            onClick={p.onHome}>
            {icon}
          </IconButton>
        ) : (
          <span className="pnav-id-ico" aria-hidden="true">{icon}</span>
        )}
        <div className="pnav-id-col">
          {p.switchMenu ? (
            <LazyDropdownMenu
              open={switchOpen}
              onOpenChange={setSwitchOpen}
              triggerRef={nameRef}
              align="start"
              label={t("projects.switch")}
              className="pnav-switch-menu"
              trigger={
                <RowButton
                  className="pnav-name-btn"
                  title={p.root ?? undefined}
                  aria-haspopup="menu"
                  aria-expanded={switchOpen}
                  aria-label={`${p.name} — ${t("projects.switch")}`}
                >
                  <span className="pnav-name">{p.name}</span>
                  <ChevronGlyph />
                </RowButton>
              }
              groups={[
                ...(p.switchMenu.recents.length
                  ? [{
                      key: "recent",
                      label: t("projects.recents-menu"),
                      items: p.switchMenu.recents.map((r) => ({
                        key: r.root,
                        label: r.name,
                        onSelect: () => p.switchMenu!.onSelect(r.root),
                      })),
                    }]
                  : []),
                {
                  key: "open",
                  separatorBefore: p.switchMenu.recents.length > 0,
                  items: [
                    { key: "all", label: t("projects.all-menu"), onSelect: p.switchMenu.onAll },
                    { key: "folder", label: t("projects.open-folder-menu"), onSelect: p.switchMenu.onOpenFolder },
                    { key: "new", label: t("projects.new-menu"), onSelect: p.switchMenu.onNew },
                  ],
                },
                ...(p.mode === "project"
                  ? [{
                      key: "settings",
                      separatorBefore: true,
                      items: [{ key: "project-settings", label: t("project.settings"), onSelect: () => p.onProjectSettings?.() }],
                    }]
                  : []),
              ]}
            />
          ) : (
            <span className="pnav-name" title={p.root ?? undefined}>{p.name}</span>
          )}
        </div>
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          triggerRef={overflowRef}
          align="end"
          label={t("project.actions")}
          className="pnav-thread-menu"
          trigger={
            <IconButton
              label={t("project.actions")}
              title={p.root ?? undefined}
              className="pnav-ov"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <OverflowGlyph />
            </IconButton>
          }
          items={[
            {
              key: "resume-claude",
              label: t("sidebar.resume-claude"),
              onSelect: () => p.onOpenResume("claude", overflowRef.current),
            },
            {
              key: "resume-codex",
              label: t("sidebar.resume-codex"),
              onSelect: () => p.onOpenResume("codex", overflowRef.current),
            },
            ...(p.mode === "project"
              ? [
                  {
                    key: "reveal-finder",
                    label: t("project.reveal-finder"),
                    onSelect: () => p.onRevealFinder?.(),
                    separatorBefore: true,
                  },
                  {
                    key: "project-settings",
                    label: t("project.settings"),
                    onSelect: () => p.onProjectSettings?.(),
                  },
                  {
                    key: "customize",
                    label: t("project.customize"),
                    onSelect: () => p.onCustomize?.(customizeAnchor()),
                  },
                  {
                    key: "remove",
                    label: t("project.remove"),
                    onSelect: () => p.onRemoveProject?.(),
                    destructive: true,
                    separatorBefore: true,
                  },
                ]
              : []),
          ]}
        />
        {p.onCollapse && (
          <IconButton label={t("action.collapse-sidebar")} title={t("action.collapse-sidebar")}
            className="pnav-ov pnav-collapse" onClick={p.onCollapse}>
            <SidebarIcon size={14} />
          </IconButton>
        )}
      </div>
      <div className="pnav-cta">
        <SearchField
          ref={inputRef}
          className="pnav-search"
          aria-label={t("sidebar.search-local")}
          placeholder={t("sidebar.search")}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && p.query) {
              e.stopPropagation();
              p.onQueryChange("");
            }
          }}
        />
        <Button
          variant="secondary"
          className="pnav-new"
          aria-label={t("action.new-chat")}
          title={t("action.new-chat")}
          onClick={p.onNew}
        >
          <PlusIcon size={14} />
        </Button>
      </div>
    </header>
  );
}
