import React from "react";
import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSidecarInfo, refreshSidecarInfo, sidecarHeaders } from "./lib/sidecarInfo";
import { createUiStateFlusher } from "./lib/uistate";

function fatalText(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const head = `${error.name}: ${error.message}`;
  if (!error.stack) return head;
  return error.stack.includes(error.message) ? error.stack : `${head}\n${error.stack}`;
}

function renderFatal(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = "";
  const box = document.createElement("div");
  box.style.cssText = [
    "min-height:100vh",
    "padding:28px",
    "background:#212429",
    "color:#e8eaed",
    "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
    "white-space:pre-wrap",
  ].join(";");
  box.textContent = `Atelier n'a pas pu afficher l'interface.\n\n${fatalText(error)}`;
  root.appendChild(box);
}

class BootBoundary extends React.Component<React.PropsWithChildren, { error: unknown }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("Atelier render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          padding: 28,
          background: "#212429",
          color: "#e8eaed",
          font: "13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
          whiteSpace: "pre-wrap",
        }}>
          {`Atelier n'a pas pu afficher l'interface.\n\n${fatalText(this.state.error)}`}
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => renderFatal(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => renderFatal(event.reason));

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
  // GARDE-FOU : invoke borné. Sinon, si le sidecar a redémarré (nouveau port)
  // ou traîne, ce await bloque et le rendu React n'arrive JAMAIS → fenêtre vide.
  try {
    await withTimeout(refreshSidecarInfo(), 6000);
  } catch (error) {
    console.warn("Atelier: sidecar injoignable, stockage local seul:", error);
  }

  const bootInfo = getSidecarInfo();
  if (bootInfo != null) {
    // hydratation best-effort (bornée) — ne doit jamais bloquer le rendu
    try {
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 2000);
      const snap: Record<string, string> = await withTimeout(
        fetch(`http://127.0.0.1:${bootInfo.port}/uistate`, { headers: sidecarHeaders(bootInfo), signal: ctrl.signal }).then((r) => r.json()),
        2500,
      );
      clearTimeout(killer);
      for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
    } catch (error) {
      console.warn("Atelier: hydratation ui.json échouée:", error);
    }

    // write-through installé DÈS qu'on a un port — MÊME si l'hydratation a
    // échoué. Le flush lit la SidecarInfo COURANTE (mise à jour à chaque
    // reconnexion WS) : après un redémarrage du sidecar, pins/favoris suivent
    // le nouveau port au lieu d'écrire dans le vide.
    const collect = () => {
      const all: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith("atelier-studio")) all[key] = localStorage.getItem(key)!;
      }
      return all;
    };
    const flush = createUiStateFlusher(collect);
    const orig = localStorage.setItem.bind(localStorage);
    let t: ReturnType<typeof setTimeout>;
    localStorage.setItem = (k: string, v: string) => {
      orig(k, v);
      clearTimeout(t);
      t = setTimeout(() => flush(false), 500);
    };
    // flush avant fermeture/masquage (keepalive survit à l'unload) : un pin
    // ajouté juste avant de quitter n'est plus perdu par le debounce de 500 ms.
    // En unload, flush(true) utilise la dernière info connue, sans chaîne async.
    window.addEventListener("pagehide", () => flush(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BootBoundary>
        <App />
      </BootBoundary>
    </React.StrictMode>,
  );
}
boot().catch(renderFatal);
