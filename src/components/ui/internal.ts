// Helpers internes des primitives ui/ (plan 016). PAS d'API publique — seuls
// les composants du barrel index.ts sont le contrat. L'ancien moteur d'overlay
// maison (place/useOverlayPosition/useDismiss/focusAnchor) a été retiré :
// positionnement, dismiss et retour focus sont désormais fournis par Base UI
// via les primitives shadcn/ (dropdown-menu, popover, tooltip, dialog).

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
