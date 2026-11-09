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
    };
  }, [ref, split, layout]);
}
