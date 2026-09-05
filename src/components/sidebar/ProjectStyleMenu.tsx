// Shared project actions and appearance panel for the rail and sidebar.
import { useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { PROJ_COLORS, PROJ_ICONS, ProjIcon } from "./projectIcons";
import { Input } from "../shadcn/input";
import { Popover, PopoverContent, PopoverTitle } from "../shadcn/popover";
import { IconButton, RowButton } from "../ui";

export type ProjMetaLite = { color?: string; label?: string };

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
  anchor: { x: number; y: number };
  /** retire le projet de la liste — l'action n'apparaît que si fournie
      (le menu contextuel du rail la donne ; le popover « Personnaliser » du
      panneau déplié non, son menu ⋯ la porte déjà) */
  onRemove?: (root: string) => void;
  onProjectSettings?: (root: string) => void;
  className?: string;
}) {
  const { root, meta, onSetMeta, onClose, anchor, className, onRemove } = props;

  const [appearance, setAppearance] = useState(!props.onProjectSettings && !onRemove);
  const backRef = useRef<HTMLButtonElement>(null);
  const customizeRef = useRef<HTMLButtonElement>(null);
  const projectName = root.split("/").filter(Boolean).pop() || root;
  const colorNames = t("project.menu-colors").split(",");
  const showAppearance = (next: boolean) => {
    setAppearance(next);
    requestAnimationFrame(() => (next ? backRef : customizeRef).current?.focus());
  };
  return (
    <Popover open onOpenChange={(next) => { if (!next) onClose(); }}>
    <PopoverContent
      plain
      side="bottom"
      align="start"
      sideOffset={4}
      className={["project-context-panel", className].filter(Boolean).join(" ")}
      anchor={() => ({
        getBoundingClientRect: () => ({
          x: anchor.x, y: anchor.y, left: anchor.x, top: anchor.y,
          right: anchor.x, bottom: anchor.y, width: 0, height: 0,
          toJSON: () => ({}),
        }),
      })}
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
        {props.onProjectSettings && <RowButton className="project-context-action" onClick={() => { props.onProjectSettings?.(root); onClose(); }}>
          <ProjIcon name="gear" size={16} /><span>{t("project.settings")}</span>
        </RowButton>}
        <RowButton ref={customizeRef} className="project-context-action" onClick={() => showAppearance(true)}>
          <ProjIcon name="pencil" size={16} /><span>{t("project.menu-customize")}</span><span aria-hidden="true" className="project-context-chevron">›</span>
        </RowButton>
        {onRemove && <><div className="project-context-divider" /><RowButton className="project-context-action project-context-danger" onClick={() => { onRemove(root); onClose(); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 4h10M6 4V2h4v2M4 4l.6 10h6.8L12 4M6.5 6.5v5M9.5 6.5v5" /></svg>
          <span>{t("project.remove")}</span>
        </RowButton></>}
      </div> : <div className="project-context-appearance">
        <RowButton ref={backRef} className="project-context-back" onClick={() => showAppearance(false)}><span aria-hidden="true">‹</span>{t("project.menu-back")}</RowButton>
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
    </PopoverContent>
    </Popover>
  );
}
