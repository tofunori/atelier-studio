// Menu / MenuItem (plan 016) — surface temporaire ancrée. Contrats a11y du
// plan : rôles menu/menuitem, focus sur le premier item à l'ouverture, flèches
// (cycle) + Home/End, Escape ferme ET rend le focus à l'ancre, clic extérieur
// ferme, sélection ferme et rend le focus. Items désactivés : natifs
// (non focusables, sautés par les flèches, non sélectionnables).
import React, { createContext, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx, focusAnchor, useDismiss, useOverlayPosition, type Placement } from "./internal";

const MenuCtx = createContext<{ requestClose: () => void } | null>(null);

const ITEM_SELECTOR = 'button[role^="menuitem"]:not([disabled])';

export function Menu(props: {
  open: boolean;
  onClose: () => void;
  /** Ancre (le bouton qui ouvre le menu) — positionnement et retour focus. */
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  placement?: Placement;
  /** Nom accessible du menu. */
  label?: string;
  className?: string;
}) {
  const { open, onClose, anchorRef, children, placement = "bottom-start", label, className } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useOverlayPosition(open, anchorRef, panelRef, placement);
  useDismiss(open, onClose, panelRef, anchorRef);

  // focus initial : premier item activable
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>(ITEM_SELECTOR)?.focus();
  }, [open]);

  if (!open) return null;

  const requestClose = () => {
    onClose();
    focusAnchor(anchorRef);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR));
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === "Tab") {
      // APG : Tab quitte le menu — fermeture sans voler la tabulation
      onClose();
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      className={cx("ui-menu", "open", className)}
      onKeyDown={onKeyDown}
    >
      <MenuCtx.Provider value={{ requestClose }}>{children}</MenuCtx.Provider>
    </div>,
    document.body,
  );
}

export function MenuItem(props: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Défini ⇒ rôle menuitemradio + aria-checked (item « courant » d'un choix). */
  selected?: boolean;
  className?: string;
}) {
  const { children, onSelect, disabled, selected, className } = props;
  const ctx = useContext(MenuCtx);
  const radio = selected !== undefined;
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? selected : undefined}
      className={cx("ui-menu-item", radio && selected && "active", className)}
      disabled={disabled}
      tabIndex={-1}
      onClick={() => {
        onSelect?.();
        ctx?.requestClose();
      }}
    >
      {children}
    </button>
  );
}

/** Séparateur visuel entre groupes d'items (fait partie de la famille Menu). */
export function MenuSeparator() {
  return <div className="ui-menu-sep" role="separator" />;
}
