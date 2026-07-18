// Write-through de l'état UI vers ui.json (plan 015, revue — correction 4).
//
// EXCEPTION ARCHITECTURALE DOCUMENTÉE : ce lifecycle s'installe au BOOTSTRAP
// (main.tsx), pas dans un hook React. Deux raisons contractuelles :
//  1. l'hydratation localStorage ← ui.json doit être terminée AVANT le premier
//     render (dev localhost:1420 et build tauri:// ont des stockages séparés :
//     rendre avant l'hydratation ferait démarrer l'app « vierge ») ;
//  2. le patch de localStorage.setItem doit capter les toutes premières
//     écritures post-hydratation — un montage React arrive trop tard.
// L'ordre d'hydratation de main.tsx n'est PAS modifié ici : ce module
// n'extrait que le lifecycle write-through, avec un cleanup complet
// (fonctions/listeners restaurés) pour les environnements de test.
import { createUiStateFlusher } from "./uistate";

/** Surface minimale de Storage utilisée — injectable en test (le localStorage
 *  de jsdom est un Proxy qui transforme `setItem = fn` en item stocké). */
export type StorageLike = {
  setItem: (k: string, v: string) => void;
  getItem: (k: string) => string | null;
  key: (i: number) => string | null;
  readonly length: number;
};

export type UiStateWriteThroughController = {
  flushNow: (keepalive?: boolean) => Promise<boolean>;
  dispose: () => void;
};

function collectUiState(storage: StorageLike): Record<string, string> {
  const all: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)!;
    if (key.startsWith("atelier-studio")) all[key] = storage.getItem(key)!;
  }
  return all;
}

/**
 * Installe le write-through : toute écriture `atelier-studio.*` est envoyée
 * (débouncée 500 ms) vers /uistate du sidecar via le flusher partagé, qui lit
 * le port/token COURANTS (suit les reconnexions). pagehide/visibilitychange
 * flushent en keepalive pour ne rien perdre à la fermeture.
 * Retourne un contrôleur qui permet de flusher l'état resté sale lorsque le
 * sidecar devient disponible, puis de restaurer les fonctions/listeners.
 */
export function installUiStateWriteThrough(
  fetchImpl?: typeof fetch,
  storage: StorageLike = localStorage,
): UiStateWriteThroughController {
  const flush = createUiStateFlusher(() => collectUiState(storage), fetchImpl);
  const orig = storage.setItem; // non lié : restauré À L'IDENTIQUE au cleanup
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writeVersion = 0;
  let flushedVersion = 0;

  const flushNow = async (keepalive = false): Promise<boolean> => {
    const targetVersion = writeVersion;
    if (targetVersion === flushedVersion) return true;
    const success = await flush(keepalive);
    if (success) flushedVersion = Math.max(flushedVersion, targetVersion);
    return success;
  };

  const patched = (k: string, v: string) => {
    orig.call(storage, k, v);
    if (!k.startsWith("atelier-studio")) return;
    writeVersion += 1;
    clearTimeout(timer);
    timer = setTimeout(() => void flushNow(false), 500);
  };
  storage.setItem = patched;
  // flush avant fermeture/masquage (keepalive survit à l'unload) : un pin
  // ajouté juste avant de quitter n'est plus perdu par le debounce de 500 ms.
  const onPageHide = () => void flushNow(true);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushNow(true);
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  const dispose = () => {
    clearTimeout(timer);
    if (storage.setItem === patched) storage.setItem = orig;
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  return { flushNow, dispose };
}
