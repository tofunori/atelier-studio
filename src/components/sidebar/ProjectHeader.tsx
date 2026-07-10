// Header du Research Navigator (plan 024, étape 3) — identité du projet
// actif, action primaire Nouveau chat, recherche locale et actions rares dans
// un overflow. Le nom local n'est PAS un sélecteur de projet : le rail et la
// top bar restent les seuls points de changement de projet.
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { Button, IconButton, Menu, MenuItem, MenuSeparator } from "../ui";
import { PlusIcon, SearchIcon, ChatsIcon } from "../icons";
import { ProjIcon } from "./projectIcons";

export type ProjMetaLite = { color?: string; label?: string };

/** Troncature milieu des chemins (contrat typo §6) — valeur complète en title. */
export function middleTruncate(value: string, max = 34): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) * 0.4);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function OverflowGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="3.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ProjectHeader(p: {
  mode: "project" | "unscoped";
  /** nom affiché — basename du root ou label de projMeta */
  name: string;
  /** chemin complet du projet ; null en mode chats sans projet */
  root: string | null;
  meta?: ProjMetaLite;
  searchOpen: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onToggleSearch: (open: boolean) => void;
  onNew: () => void;
  onOpenResume: (provider: "claude" | "codex") => void;
  onRevealFinder?: () => void;
  /** ouvre le popover couleur/icône, ancré sous le bouton overflow */
  onCustomize?: (anchor: { x: number; y: number }) => void;
  onRemoveProject?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // ancre = wrapper span (IconButton ne transmet pas de ref) ; focusAnchor
  // sait retrouver le premier focusable du conteneur
  const overflowRef = useRef<HTMLSpanElement | null>(null);
  const searchWrapRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (p.searchOpen) inputRef.current?.focus();
  }, [p.searchOpen]);

  function closeSearch() {
    p.onQueryChange("");
    p.onToggleSearch(false);
    searchWrapRef.current?.querySelector("button")?.focus();
  }

  function customizeAnchor(): { x: number; y: number } {
    const r = overflowRef.current?.getBoundingClientRect();
    return r ? { x: Math.max(8, r.right - 220), y: r.bottom + 4 } : { x: 60, y: 80 };
  }

  const icon = p.meta?.label?.startsWith("icon:") ? (
    <ProjIcon name={p.meta.label.slice(5)} size={14} />
  ) : p.meta?.label ? (
    <span className="pnav-id-letter">{p.meta.label}</span>
  ) : p.mode === "project" ? (
    <span className="proj-dot" style={{ background: p.meta?.color ?? "var(--muted2)" }} />
  ) : (
    <ChatsIcon size={14} />
  );

  return (
    <header className="pnav-header">
      {/* identité projet UNE seule fois dans l'app : le crumb de la TopBar.
          Sans projet actif (pas de crumb), le panneau garde son titre. */}
      {p.mode === "unscoped" && (
        <div className="pnav-id">
          <span className="pnav-id-ico" aria-hidden="true">{icon}</span>
          <div className="pnav-id-col">
            <span className="pnav-name">{p.name}</span>
          </div>
        </div>
      )}
      <div className="pnav-cta">
        <Button variant="secondary" className="pnav-new" onClick={p.onNew}>
          <span className="pnav-new-ico" aria-hidden="true"><PlusIcon size={12} /></span>
          {t("action.new-chat")}
        </Button>
        <span ref={searchWrapRef} className="pnav-search-wrap">
          <IconButton
            label={t("sidebar.search-local")}
            className={p.searchOpen ? "pnav-search-btn on" : "pnav-search-btn"}
            aria-expanded={p.searchOpen}
            onClick={() => (p.searchOpen ? closeSearch() : p.onToggleSearch(true))}
          >
            <SearchIcon size={13} />
          </IconButton>
        </span>
        <span ref={overflowRef} className="pnav-ov-wrap">
          <IconButton
            label={t("project.actions")}
            title={p.root ?? undefined}
            className="pnav-ov"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <OverflowGlyph />
          </IconButton>
        </span>
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={overflowRef}
          label={t("project.actions")}
          placement="bottom-end"
        >
          <MenuItem onSelect={() => p.onOpenResume("claude")}>{t("sidebar.resume-claude")}</MenuItem>
          <MenuItem onSelect={() => p.onOpenResume("codex")}>{t("sidebar.resume-codex")}</MenuItem>
          {p.mode === "project" && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => p.onRevealFinder?.()}>{t("project.reveal-finder")}</MenuItem>
              <MenuItem onSelect={() => p.onCustomize?.(customizeAnchor())}>
                {t("project.customize")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem className="danger" onSelect={() => p.onRemoveProject?.()}>
                {t("project.remove")}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      {p.searchOpen && (
        <input
          ref={inputRef}
          type="search"
          className="pnav-search"
          aria-label={t("sidebar.search-local")}
          placeholder={t("sidebar.search-local")}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closeSearch();
            }
          }}
        />
      )}
    </header>
  );
}
