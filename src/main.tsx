import React from "react";
import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

type SidecarInfo = { port: number; token?: string };

// Hydrate le localStorage depuis l'état UI partagé du sidecar (ui.json) AVANT
// le rendu — dev (localhost:1420) et app buildée (tauri://) ont des stockages
// séparés ; sans ça, l'app buildée démarre vierge (projets, réglages, favoris).
/** Course une promesse contre un délai — jamais de blocage infini. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function boot() {
  try {
    // GARDE-FOU : invoke ET fetch bornés dans le temps. Sinon, si le sidecar a
    // redémarré (nouveau port) ou traîne, ce await bloque et le rendu React
    // n'arrive JAMAIS → fenêtre vide. Le rendu doit être garanti coûte que coûte.
    const { port, token } = await withTimeout(invoke<SidecarInfo>("sidecar_port"), 2500);
    const headers = token ? { "x-atelier-token": token } : undefined;
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 2000);
    const snap: Record<string, string> = await withTimeout(
      fetch(`http://127.0.0.1:${port}/uistate`, { headers, signal: ctrl.signal }).then((r) => r.json()),
      2500,
    );
    clearTimeout(killer);
    // ui.json est autoritaire : le write-through le garde à jour depuis la
    // dernière app utilisée (dev ou buildée) — on écrase toujours au boot.
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
    // write-through débouncé : toute écriture repart vers ui.json
    const orig = localStorage.setItem.bind(localStorage);
    let t: ReturnType<typeof setTimeout>;
    localStorage.setItem = (k: string, v: string) => {
      orig(k, v);
      clearTimeout(t);
      t = setTimeout(() => {
        const all: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)!;
          if (key.startsWith("atelier-studio")) all[key] = localStorage.getItem(key)!;
        }
        fetch(`http://127.0.0.1:${port}/uistate`, {
          method: "POST",
          headers,
          body: JSON.stringify(all),
        }).catch(() => {});
      }, 500);
    };
  } catch {
    // sidecar indisponible : démarrage normal sur le localStorage local
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
boot();
