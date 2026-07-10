// Helpers internes des primitives ui/ (plan 016). PAS d'API publique — seuls
// les douze composants du barrel index.ts sont le contrat. Positionnement
// maison minimal (fixed + clamp + flip vertical) : décision documentée du plan
// pour éviter une dépendance de positionnement tant que les besoins restent
// « menu/popover/tooltip ancrés à un bouton ».
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type Placement =
  | "bottom-start"
  | "bottom-end"
  | "bottom"
  | "top-start"
  | "top-end"
  | "top";

const GAP = 6;
const VIEWPORT_MARGIN = 8;

function place(anchor: HTMLElement, panel: HTMLElement, placement: Placement) {
  const a = anchor.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // flip vertical si la place manque du côté demandé (les menus du composer
  // s'ouvrent vers le haut, ceux de la TopBar vers le bas)
  let side: "top" | "bottom" = placement.startsWith("top") ? "top" : "bottom";
  if (side === "bottom" && a.bottom + GAP + p.height > vh - VIEWPORT_MARGIN && a.top - GAP - p.height >= VIEWPORT_MARGIN) side = "top";
  else if (side === "top" && a.top - GAP - p.height < VIEWPORT_MARGIN && a.bottom + GAP + p.height <= vh - VIEWPORT_MARGIN) side = "bottom";

  const top = side === "bottom" ? a.bottom + GAP : a.top - GAP - p.height;
  let left: number;
  if (placement.endsWith("-start")) left = a.left;
  else if (placement.endsWith("-end")) left = a.right - p.width;
  else left = a.left + a.width / 2 - p.width / 2;

  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - p.width - VIEWPORT_MARGIN));
  const clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - p.height - VIEWPORT_MARGIN));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(clampedTop)}px`;
}

/** Positionne un panneau fixed près de son ancre tant qu'il est ouvert
 * (repositionne sur resize et scroll capturé). */
export function useOverlayPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null> | undefined,
  panelRef: RefObject<HTMLElement | null>,
  placement: Placement,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const a = anchorRef?.current;
      const p = panelRef.current;
      if (a && p) place(a, p, placement);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, panelRef, placement]);
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';

/** Rend le focus à l'ancre. Si l'ancre est un conteneur non focusable (pattern
 * wrapper autour d'un IconButton), cible le premier focusable qu'elle contient
 * — sinon le retour focus échouerait en silence. */
export function focusAnchor(anchorRef?: RefObject<HTMLElement | null>) {
  const a = anchorRef?.current;
  if (!a) return;
  if (a.matches(FOCUSABLE)) a.focus();
  else a.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

/** Fermeture standard d'une surface temporaire : Escape (avec retour focus à
 * l'ancre) et clic à l'extérieur (sans retour focus — l'utilisateur est parti
 * ailleurs). Le mousedown sur l'ancre est ignoré pour laisser le toggle de
 * l'appelant fermer sans réouverture immédiate. */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  anchorRef?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeRef.current();
      focusAnchor(anchorRef);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, panelRef, anchorRef]);
}
