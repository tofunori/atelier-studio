// Shared project actions and appearance panel for the rail and sidebar.
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import { PROJ_COLORS, PROJ_ICONS, ProjIcon } from "./projectIcons";
import { Input } from "../shadcn/input";
import { Popover, PopoverTitle } from "../shadcn/popover";
import { Separator } from "../shadcn/separator";
import { MenuPanelContent, MenuPanelItem } from "../ui/MenuPanel";
import { IconButton, RowButton } from "../ui";

export type ProjMetaLite = { color?: string; label?: string };
export type ProjectStyleAnchor = { x: number; y: number } | Element;

// libellé accessible d'une icône : PROJ_ICONS n'a pas de traduction dédiée
// (24 icônes purement décoratives) — un nom lisible dérivé de la clé vaut
// mieux qu'un bouton muet pour le lecteur d'écran.
function iconLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function ProjectStyleMenu(props: {
  /** racine du projet ciblé — transmise telle quelle à onSetMeta */
  root: string;
  meta: ProjMetaLite | undefined;
  onSetMeta: (root: string, meta: ProjMetaLite) => void;
  /** ferme le popover — appelé après le choix d'une icône ou la validation de la lettre */
  onClose: () => void;
  /** point d'ancrage (coordonnées viewport du clic ou du bouton déclencheur) */
  anchor: ProjectStyleAnchor;
  /** retire le projet de la liste — l'action n'apparaît que si fournie
      (le menu contextuel du rail la donne ; le popover « Personnaliser » du
      panneau déplié non, son menu ⋯ la porte déjà) */
  onRemove?: (root: string) => void;
  onProjectSettings?: (root: string) => void;
  className?: string;
}) {
  const { root, meta, onSetMeta, onClose, anchor, className, onRemove } = props;
  const anchorTarget = typeof Element !== "undefined" && anchor instanceof Element
    ? anchor
    : (() => {
      const point = anchor as { x: number; y: number };
      return {
        getBoundingClientRect: () => ({
          x: point.x, y: point.y, left: point.x, top: point.y,
          right: point.x, bottom: point.y, width: 0, height: 0,
          toJSON: () => ({}),
        }),
      };
    });
  const finalFocusRef = useRef<HTMLElement | null>(
    typeof HTMLElement !== "undefined" && anchor instanceof HTMLElement ? anchor : null,
  );

  const [appearance, setAppearance] = useState(!props.onProjectSettings && !onRemove);
  const backRef = useRef<HTMLButtonElement>(null);
  const customizeRef = useRef<HTMLButtonElement>(null);
  const previousAppearance = useRef(appearance);
  useLayoutEffect(() => {
    if (previousAppearance.current === appearance) return;
    previousAppearance.current = appearance;
    (appearance ? backRef : customizeRef).current?.focus();
  }, [appearance]);
  const projectName = root.split("/").filter(Boolean).pop() || root;
  const colorNames = t("project.menu-colors").split(",");
  const showAppearance = (next: boolean) => {
    setAppearance(next);
  };
  return (
    <Popover open onOpenChange={(next) => { if (!next) onClose(); }}>
    <MenuPanelContent
      side="bottom"
      align="start"
      sideOffset={4}
      className={["project-context-panel", className].filter(Boolean).join(" ")}
      anchor={anchorTarget}
      finalFocus={finalFocusRef}
      initialFocus={() => (appearance ? backRef : customizeRef).current}
    >
      <div className="project-context-heading">
        <span className="project-context-avatar" style={{ color: meta?.color }} aria-hidden="true">
          {meta?.label?.startsWith("icon:") ? <ProjIcon name={meta.label.slice(5)} size={18} /> : meta?.label || <ProjIcon name="folder" size={18} />}
        </span>
        <div className="project-context-identity">
          <PopoverTitle className="project-context-name">{projectName}</PopoverTitle>
          <span className="project-context-path" title={root}>{root}</span>
        </div>
      </div>
      {!appearance ? <div className="project-context-actions">
        {props.onProjectSettings && <MenuPanelItem className="project-context-action" onClick={() => { props.onProjectSettings?.(root); onClose(); }}>
          <ProjIcon name="gear" size={16} /><span>{t("project.settings")}</span>
        </MenuPanelItem>}
        <MenuPanelItem ref={customizeRef} className="project-context-action" onClick={() => showAppearance(true)}>
          <ProjIcon name="pencil" size={16} /><span>{t("project.menu-customize")}</span><ChevronRightIcon aria-hidden="true" className="project-context-chevron" />
        </MenuPanelItem>
        {onRemove && <><Separator className="project-context-divider" /><MenuPanelItem className="project-context-action project-context-danger" onClick={() => { onRemove(root); onClose(); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M4 4l.6 10h6.8L12 4M6.5 6.5v5M9.5 6.5v5" /></svg>
          <span>{t("project.remove")}</span>
        </MenuPanelItem></>}
      </div> : <div className="project-context-appearance">
        <MenuPanelItem ref={backRef} className="project-context-back" onClick={() => showAppearance(false)}><ChevronLeftIcon aria-hidden="true" />{t("project.menu-back")}</MenuPanelItem>
        <div className="project-context-label">{t("project.menu-color")}</div>
      <div className="swatches">
        {PROJ_COLORS.map((c, index) => (
          <RowButton
            key={c}
            className="swatch"
            style={{ background: c }}
            aria-label={colorNames[index]}
            aria-pressed={meta?.color === c}
            onClick={() => onSetMeta(root, { ...meta, color: c })}
          />
        ))}
        <RowButton
          className="swatch none"
          aria-label={t("sidebar.without-color")}
          aria-pressed={!meta?.color}
          onClick={() => onSetMeta(root, { ...meta, color: undefined })}
        >
          /
        </RowButton>
      </div>
      <div className="project-context-label">{t("project.menu-icon")}</div>
      <div className="emoji-grid">
        {Object.keys(PROJ_ICONS).map((name) => {
          const active = meta?.label === "icon:" + name;
          return (
            <IconButton
              key={name}
              className={`emoji-cell ${active ? "on" : ""}`}
              aria-pressed={active}
              label={iconLabel(name)}
              onClick={() => {
                onSetMeta(root, { ...meta, label: "icon:" + name });
                onClose();
              }}
            >
              <ProjIcon name={name} size={14} />
            </IconButton>
          );
        })}
        <RowButton
          className="emoji-cell none"
          aria-label={t("project.menu-reset-icon")}
          onClick={() => {
            onSetMeta(root, { ...meta, label: undefined });
            onClose();
          }}
        >
          ∅
        </RowButton>
      </div>
      <label className="project-context-label" htmlFor="project-icon-letters">{t("project.menu-letters")}</label>
        <Input
          id="project-icon-letters"
          className="icon-letter"
          placeholder="Aa"
          maxLength={2}
          defaultValue={meta?.label?.startsWith("icon:") ? "" : meta?.label ?? ""}
          title={t("sidebar.letter-title")}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              onSetMeta(root, { ...meta, label: v || undefined });
              onClose();
            }
          }}
        />
      </div>}
    </MenuPanelContent>
    </Popover>
  );
}
