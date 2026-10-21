import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Pose `html[data-fullscreen]` quand la fenêtre native est en plein écran
 * macOS (⌃⌘F). Les feux tricolores disparaissent alors : la barre du haut
 * n'a plus à leur réserver ses 92 px (local-headers.css, audit GAP-22).
 * Hors Tauri (navigateur, bancs visuels, tests) : rien.
 */
export function trackWindowFullscreen(root: HTMLElement = document.documentElement): () => void {
  if (!isTauri()) return () => {};
  const appWindow = getCurrentWindow();
  let disposed = false;
  let unlisten: (() => void) | null = null;
  const sync = () => {
    void appWindow.isFullscreen()
      .then((fullscreen) => { if (!disposed) root.toggleAttribute("data-fullscreen", fullscreen); })
      .catch(() => {});
  };
  sync();
  // l'entrée et la sortie du plein écran redimensionnent toujours la fenêtre
  void appWindow.onResized(sync)
    .then((stop) => { if (disposed) stop(); else unlisten = stop; })
    .catch(() => {});
  return () => {
    disposed = true;
    unlisten?.();
  };
}
