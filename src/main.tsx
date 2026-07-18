import React from "react";
import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ensureSidecarInfo } from "./lib/sidecarInfo";
import { installUiStateWriteThrough } from "./lib/uiStateWriteThrough";
import { hydrateUiStateBeforeRender } from "./lib/uiStateBootstrap";
import { AppOverlays } from "./components/ui";
import { BootProbe } from "./components/BootProbe";
import { markBootMetric, setBootMetricFlags, startBootMetrics } from "./lib/bootMetrics";

void startBootMetrics().catch(() => {});

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

function isBenignResizeObserverError(event: ErrorEvent) {
  return event.error == null && (
    event.message === "ResizeObserver loop limit exceeded"
    || event.message === "ResizeObserver loop completed with undelivered notifications."
  );
}

window.addEventListener("error", (event) => {
  // Les listes virtualisées peuvent provoquer ce signal navigateur bénin quand
  // plusieurs mesures convergent dans la même frame. Il ne s'agit ni d'une
  // exception React ni d'un échec de boot, donc l'écran fatal ne doit pas
  // remplacer une interface saine.
  if (isBenignResizeObserverError(event)) return;
  renderFatal(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => renderFatal(event.reason));

async function boot() {
  // Les fixtures visuelles ne font pas partie du bundle release. Le script
  // test:visual les active explicitement pour son build de référence.
  const visualBench = import.meta.env.VITE_VISUAL_BENCH === "1";
  // banc d'essai des primitives (plan 016) : #uibench court-circuite l'app.
  // Import dynamique → chunk séparé, rien n'entre dans le chemin de chargement
  // normal ; aucun besoin du sidecar, captures visuelles reproductibles.
  if (visualBench && window.location.hash.startsWith("#uibench")) {
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
  // banc de captures des surfaces workspace (plan 018) — mêmes garanties
  if (visualBench && window.location.hash.startsWith("#wsbench")) {
    const { WsBench } = await import("./components/WsBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <WsBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }
  // banc de captures de la page Réglages (plan 021)
  if (visualBench && window.location.hash.startsWith("#setbench")) {
    const { SetBench } = await import("./components/SetBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <SetBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }
  // banc de captures du fil de chat et du composer (plan 020)
  if (visualBench && window.location.hash.startsWith("#agentbench")) {
    const { AgentPaneBench } = await import("./components/AgentPaneBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <AgentPaneBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }
  // banc de captures du fil de chat et du composer (plan 020)
  if (visualBench && window.location.hash.startsWith("#chatbench")) {
    const { ChatBench } = await import("./components/ChatBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <ChatBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }
  // banc de captures du Quick Ask et de son sélecteur complet
  if (visualBench && window.location.hash.startsWith("#qabench")) {
    localStorage.removeItem("atelier-studio.qaBox");
    localStorage.removeItem("atelier-studio.qaSelection");
    const { QuickAskBench } = await import("./components/QuickAskBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <BootBoundary>
        <QuickAskBench />
      </BootBoundary>,
    );
    return;
  }
  // banc de captures du panneau Projets / Research Navigator (plan 024)
  if (visualBench && window.location.hash.startsWith("#navbench")) {
    const { NavBench } = await import("./components/NavBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <NavBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }
  // banc de captures du Research Home (plan 017) — mêmes garanties que #uibench
  if (visualBench && window.location.hash.startsWith("#homebench")) {
    const { HomeBench } = await import("./components/HomeBench");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <BootBoundary>
          <HomeBench />
        </BootBoundary>
      </React.StrictMode>,
    );
    return;
  }

  // P1 : ui.json est lu directement par Tauri. Cette lecture fixe, bornée et
  // en lecture seule ne dépend ni du sidecar, ni de son health, ni de Tailscale.
  const uiStateSource = await hydrateUiStateBeforeRender();
  setBootMetricFlags({ uiStateSource });
  markBootMetric("uiStateHydrated");
  const uiStateBridge = installUiStateWriteThrough();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BootBoundary>
        <AppOverlays>
          <BootProbe />
          <App />
        </AppOverlays>
      </BootBoundary>
    </React.StrictMode>,
  );

  // P2 : le rendu ne dépend plus du sidecar. Le hook de connexion et cette
  // continuation peuvent demander l'info en parallèle : SidecarInfo garantit
  // une seule invocation native. Le second frame laisse le premier paint
  // passer avant les travaux de convergence et ferme le write-through sale.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    void ensureSidecarInfo()
      .then(() => uiStateBridge.flushNow())
      .catch((error) => console.warn("Atelier: sidecar injoignable, stockage local seul:", error));
  }));
}
boot().catch(renderFatal);
