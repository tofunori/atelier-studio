import React from "react";
import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

type SidecarInfo = { port: number; token?: string };

// Hydrate le localStorage depuis l'état UI partagé du sidecar (ui.json) AVANT
// le rendu — dev (localhost:1420) et app buildée (tauri://) ont des stockages
// séparés ; sans ça, l'app buildée démarre vierge (projets, réglages, favoris).
async function boot() {
  try {
    const { port, token } = await invoke<SidecarInfo>("sidecar_port");
    const headers = token ? { "x-atelier-token": token } : undefined;
    const snap: Record<string, string> = await (
      await fetch(`http://127.0.0.1:${port}/uistate`, { headers })
    ).json();
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
