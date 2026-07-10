import React from "react";
import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSidecarInfo, refreshSidecarInfo, sidecarHeaders } from "./lib/sidecarInfo";
import { installUiStateWriteThrough } from "./lib/uiStateWriteThrough";

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
  // banc d'essai des primitives (plan 016) : #uibench court-circuite l'app.
  // Import dynamique → chunk séparé, rien n'entre dans le chemin de chargement
  // normal ; aucun besoin du sidecar, captures visuelles reproductibles.
  if (window.location.hash.startsWith("#uibench")) {
    const { UiBench } = await import("./components/ui/UiBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <UiBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }

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
    // échoué. Lifecycle extrait dans lib/uiStateWriteThrough (exception
    // architecturale documentée là-bas : bootstrap, pas hook React — l'ordre
    // d'hydratation ci-dessus ne change pas).
    installUiStateWriteThrough();
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
