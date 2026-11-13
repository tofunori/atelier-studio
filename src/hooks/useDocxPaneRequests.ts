import { useEffect, type RefObject } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

/**
 * Bouton « Commentaires » du panneau Word (2026-11-12) : l'iframe .docx
 * demande la place de sa marge de commentaires, l'app élargit le panneau de
 * droite d'autant (la conversation cède, jusqu'à son minimum de 30 %), puis
 * le rend à la largeur d'avant quand la marge se ferme. Même contrôle que les
 * autres messages des éditeurs : origine de la galerie, iframe de la page,
 * nonce du fragment quand il y en a un.
 *
 * Message reçu : { type: "atelier-docx-pane", action: "widen" | "restore", px, nonce }
 * Réponse : { type: "atelier-docx-pane-done", action, ok } (ok = place entière accordée).
 */
const MS = 200;
const CHAT_MIN = 30;

export function useDocxPaneRequests(
  panel: RefObject<ImperativePanelHandle | null>,
  galleryUrl: string | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !galleryUrl) return;
    let origin = "";
    try { origin = new URL(galleryUrl).origin; } catch { return; }
    let restore: { from: number; to: number } | null = null;
    let raf = 0;

    const animate = (from: number, to: number, done: () => void) => {
      cancelAnimationFrame(raf);
      const handle = panel.current;
      if (!handle) { done(); return; }
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { handle.resize(to); done(); return; }
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / MS);
        handle.resize(from + (to - from) * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(step);
        else done();
      };
      raf = requestAnimationFrame(step);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; action?: unknown; px?: unknown; nonce?: unknown } | null;
      if (data?.type !== "atelier-docx-pane") return;
      const frame = Array.from(document.querySelectorAll("iframe")).find((f) => f.contentWindow === event.source);
      if (!frame) return;
      try {
        const src = new URL(frame.src);
        const nonce = new URLSearchParams(src.hash.slice(1)).get("atelier_nonce");
        if (nonce && data.nonce !== nonce) return;
        // Un dossier rattaché au projet a son propre serveur (autre port) :
        // admis seulement avec le nonce de l'app, vérifié ci-dessus.
        if (event.origin !== origin && !(nonce && event.origin === src.origin)) return;
      } catch { return; }
      const action = data.action === "restore" ? "restore" : data.action === "widen" ? "widen" : null;
      if (!action) return;
      const reply = (ok: boolean) => (event.source as Window | null)?.postMessage({ type: "atelier-docx-pane-done", action, ok }, event.origin);
      const handle = panel.current;
      const host = document.querySelector<HTMLElement>('[data-panel-id="atelier"]');
      const chat = document.querySelector<HTMLElement>('[data-panel-id="chat"]');
      if (!handle || !host || !chat || !chat.offsetWidth) { reply(false); return; }
      const size = handle.getSize();

      if (action === "restore") {
        const back = restore;
        restore = null;
        // Panneau retouché à la main entre-temps : on le laisse où il est.
        if (!back || Math.abs(size - back.to) > 0.5) { reply(false); return; }
        animate(size, back.from, () => reply(true));
        return;
      }

      const px = Number(data.px);
      const width = host.getBoundingClientRect().width;
      if (!(px > 0) || !width || !size) { reply(false); return; }
      // Le document peut n'occuper qu'une part du panneau (espace de travail
      // partagé) : il faut élargir le panneau d'autant plus.
      const pane = frame.closest<HTMLElement>(".workspace-pane") ?? frame;
      const share = Math.min(1, Math.max(0.1, pane.getBoundingClientRect().width / width));
      const want = px / share / (width / size);
      const target = Math.min(100 - CHAT_MIN, size + want);
      if (target <= size + 0.1) { reply(false); return; }
      const from = restore?.from ?? size;
      animate(size, target, () => {
        restore = { from, to: handle.getSize() };
        reply(target >= size + want - 0.1);
      });
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); cancelAnimationFrame(raf); };
  }, [panel, galleryUrl, enabled]);
}
