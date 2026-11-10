const EDGE_HALVES = [
  { tab: '.topbar[data-chat-attached] .topbar-start .document-tab-shell[data-active="true"]', panel: '[data-panel-id="chat"]' },
  { tab: '.topbar[data-atelier-attached] .topbar-right .document-tab-shell[data-active="true"]', panel: '[data-panel-id="atelier"]' },
];

/**
 * Languette d'un seul tenant (2026-11-09) : quand l'onglet actif d'une moitié
 * part pile du bord gauche de son panneau, il perd son pied gauche
 * (data-panel-edge) et le panneau son coin haut gauche (data-tab-edge, posé
 * aussi sur .main-card quand elle partage ce coin). Sinon l'onglet tomberait
 * sur l'arrondi du panneau. Appelé à chaque rendu de la barre et à chaque
 * redimensionnement ; `null` efface tout.
 */
export function syncTabEdges(bar: HTMLElement | null) {
  document.querySelectorAll("[data-panel-edge]").forEach(el => el.removeAttribute("data-panel-edge"));
  document.querySelectorAll("[data-tab-edge]").forEach(el => el.removeAttribute("data-tab-edge"));
  if (!bar) return;
  for (const half of EDGE_HALVES) {
    const tab = bar.querySelector<HTMLElement>(half.tab.replace(".topbar", ":scope"));
    const panel = document.querySelector<HTMLElement>(half.panel);
    if (!tab || !panel) continue;
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.width === 0 || Math.abs(tab.getBoundingClientRect().left - panelRect.left) >= 1) continue;
    tab.setAttribute("data-panel-edge", "");
    panel.setAttribute("data-tab-edge", "");
    const card = panel.closest<HTMLElement>(".main-card");
    if (card && Math.abs(card.getBoundingClientRect().left - panelRect.left) < 1) card.setAttribute("data-tab-edge", "");
  }
}
