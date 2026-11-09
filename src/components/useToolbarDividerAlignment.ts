import { useLayoutEffect, type RefObject } from "react";

/**
 * Cale les deux moitiés de la barre du haut sur les panneaux qu'elles
 * pilotent (onglets posés, 2026-11-09). Pose, en coordonnées de la barre :
 *  - --tb-chat-left : bord gauche du panneau du chat (la colonne de gauche
 *    peut être ouverte ou repliée) ;
 *  - --tb-axis : axe du séparateur chat | atelier en côte à côte, sinon bord
 *    gauche du panneau de l'atelier.
 * Le CSS en tire la grille ; sans mesure, il retombe sur une moitié/moitié.
 */
export function useToolbarDividerAlignment(ref: RefObject<HTMLDivElement | null>, split: boolean, layout = "") {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const divider = () => document.querySelector<HTMLElement>('[data-panel-resize-handle-id="chat-atelier-divider"]');
    const chat = () => document.querySelector<HTMLElement>('[data-panel-id="chat"]');
    const atelier = () => document.querySelector<HTMLElement>('[data-panel-id="atelier"]');
    const align = () => {
      const rect = bar.getBoundingClientRect();
      const chatRect = chat()?.getBoundingClientRect();
      const atelierRect = atelier()?.getBoundingClientRect();
      const boundary = split ? divider()?.getBoundingClientRect() : null;
      const chatLeft = chatRect && chatRect.width > 0 ? chatRect.left - rect.left
        : atelierRect ? atelierRect.left - rect.left : 0;
      const axis = boundary && boundary.width > 0 ? boundary.left + boundary.width / 2 - rect.left
        : atelierRect && atelierRect.width > 0 ? atelierRect.left - rect.left : rect.width / 2;
      bar.style.setProperty("--tb-chat-left", `${Math.max(0, chatLeft)}px`);
      bar.style.setProperty("--tb-axis", `${Math.max(0, axis)}px`);
      syncTabEdges(bar);
    };
    align();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(align);
    const group = chat()?.parentElement;
    [bar, chat(), atelier(), group].forEach(element => { if (element) observer.observe(element); });
    window.addEventListener("resize", align);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", align);
      bar.style.removeProperty("--tb-chat-left");
      bar.style.removeProperty("--tb-axis");
      syncTabEdges(null);
    };
  }, [ref, split, layout]);
}

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
