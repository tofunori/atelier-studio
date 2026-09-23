// Visibilité des iframes d'onglets (PIEGES_CONNUS §4) : un iframe en
// display:none ne voit ni visibilitychange ni document.hidden changer, donc
// ses sondes (mtime PDF, /statfile, /rev) tournaient même cachées. L'app
// prévient chaque iframe ; atelier_theme.js (éditeurs, visionneuses) et le
// gabarit galerie font alors refléter l'onglet à document.hidden.

const lastSent = new WeakMap<HTMLIFrameElement, boolean>();

function frameIsVisible(frame: HTMLIFrameElement): boolean {
  // vide pour display:none sur l'iframe OU sur un ancêtre (couche d'onglet,
  // section de dossier masquée)
  return frame.getClientRects().length > 0;
}

/** Poste l'état de chaque iframe d'atelier sous `root`, seulement s'il a changé. */
export function syncFrameVisibility(root: ParentNode | null | undefined): void {
  if (!root) return;
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe.atelier")) {
    const visible = frameIsVisible(frame);
    if (lastSent.get(frame) === visible) continue;
    lastSent.set(frame, visible);
    frame.contentWindow?.postMessage({ type: "atelier-tab-visibility", visible }, "*");
  }
}

/** Après un (re)chargement, la page repart visible : renvoyer son état. */
export function resetFrameVisibility(frame: HTMLIFrameElement): void {
  lastSent.delete(frame);
}
