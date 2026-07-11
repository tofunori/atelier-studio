// Popover « couleur et icône » d'un projet (plan 021, a11y) — extrait de
// Sidebar.tsx et Rail.tsx où le même markup était dupliqué caractère pour
// caractère. Ce composant est désormais la seule source de vérité pour les
// deux appelants (popover Personnaliser du Research Navigator, menu
// contextuel des puces du rail).
//
// Cellules = <button> natifs (et non des <span onClick>) pour que Tab +
// Entrée/Espace fonctionnent sans JS additionnel ; aria-label décrit
// l'action (couleur hex ou « sans couleur »), aria-pressed reflète l'icône
// active. Classes CSS conservées à l'identique (swatch, emoji-cell, …) — le
// CSS existant continue de s'appliquer, voir le rapport pour le reset natif
// <button> qui manque encore côté App.css.
import type { CSSProperties } from "react";
import { t } from "../../lib/i18n";
import { PROJ_COLORS, PROJ_ICONS, ProjIcon } from "./projectIcons";

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
  style?: CSSProperties;
  className?: string;
}) {
  const { root, meta, onSetMeta, onClose, style, className } = props;

  return (
    <div
      className={className ? `rail-menu ${className}` : "rail-menu"}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="rail-menu-title">{root.split("/").pop()}</div>
      <div className="swatches">
        {PROJ_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c }}
            aria-label={c}
            onClick={() => onSetMeta(root, { ...meta, color: c })}
          />
        ))}
        <button
          type="button"
          className="swatch none"
          aria-label={t("sidebar.without-color")}
          onClick={() => onSetMeta(root, { ...meta, color: undefined })}
        >
          ∅
        </button>
      </div>
      <div className="emoji-grid">
        {Object.keys(PROJ_ICONS).map((name) => {
          const active = meta?.label === "icon:" + name;
          return (
            <button
              key={name}
              type="button"
              className={`emoji-cell ${active ? "on" : ""}`}
              aria-pressed={active}
              aria-label={iconLabel(name)}
              onClick={() => {
                onSetMeta(root, { ...meta, label: "icon:" + name });
                onClose();
              }}
            >
              <ProjIcon name={name} size={14} />
            </button>
          );
        })}
        <input
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
        <button
          type="button"
          className="emoji-cell none"
          aria-label={t("sidebar.without-color")}
          onClick={() => {
            onSetMeta(root, { ...meta, label: undefined });
            onClose();
          }}
        >
          ∅
        </button>
      </div>
    </div>
  );
}
