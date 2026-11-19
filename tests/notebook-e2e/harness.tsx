// Banc de test de bout en bout de l'onglet cahier : VRAI serveur Rust
// (atelier-studio-server), VRAI NotebookTab, VRAI noyau. Paramètres dans l'URL :
// ?port=&token=&path=&root=&theme=dark|light
import React from "react";
import ReactDOM from "react-dom/client";
import "../../src/styles/tokens.css";
import "../../src/styles/shadcn.css";
import "../../src/styles/typeset.css";
import "../../src/styles/primitives.css";
import "../../src/styles/inspector.css";
import "../../src/App.css";
import { setSidecarInfo } from "../../src/lib/sidecarInfo";
import { setWs } from "../../src/lib/wsBus";
import { relaySidecarMessage } from "../../src/lib/sidecarRelays";
import { setLanguage } from "../../src/lib/i18n";
import { applyAppearance } from "../../src/lib/appTheme";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import { AppOverlays } from "../../src/components/ui";
import NotebookTab from "../../src/components/NotebookTab";

const q = new URLSearchParams(location.search);
const port = Number(q.get("port"));
const token = q.get("token") ?? "";
const path = q.get("path") ?? "";
const root = q.get("root") ?? "";
const theme = (q.get("theme") ?? "dark") as "dark" | "light";
setLanguage("fr");
document.documentElement.dataset.theme = theme;
const preset = q.get("preset");
try { applyAppearance({ ...DEFAULT_SETTINGS, theme, ...(preset ? { themePreset: preset } : {}) } as never, "bench"); } catch (e) { console.warn("theme", e); }
setSidecarInfo({ port, token });
// WKWebView (Atelier sur Mac) n'a pas d'ancrage de défilement : on le coupe
// pour voir ce que voit Thierry.
if (q.get("noanchor") === "1") {
  const st = document.createElement("style");
  st.textContent = "*{overflow-anchor:none!important}";
  document.head.append(st);
}

const w = window as unknown as Record<string, unknown>;
w.__chat = [] as string[];
w.__quickAsk = [] as unknown[];
w.__wsLog = [] as unknown[];
window.addEventListener("kernel-add-to-chat", (e) => (w.__chat as string[]).push((e as CustomEvent).detail?.text));
window.addEventListener("quick-ask-open", (e) => (w.__quickAsk as unknown[]).push((e as CustomEvent).detail));
// Figure annotée envoyée au chat : l'hôte (App) l'accepte, le banc la garde.
w.__figures = [] as unknown[];
window.addEventListener("notebook-figure-to-chat", (e) => {
  const d = (e as CustomEvent).detail;
  d.accepted = true;
  (w.__figures as unknown[]).push({ ...d });
});

const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${encodeURIComponent(token)}`);
ws.onmessage = (e) => {
  try {
    const msg = JSON.parse(String(e.data));
    if (String(msg.type).startsWith("notebook")) (w.__wsLog as unknown[]).push(msg);
    relaySidecarMessage(msg);
  } catch (err) { console.warn(err); }
};
ws.onopen = () => {
  setWs(ws);
  w.__wsOpen = true;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <AppOverlays>
      <div className="workspace-tab-content surface-body" style={{ display: "flex", flex: 1, minWidth: 0 }}>
        <NotebookTab tabId="bench" url={`/.fig_thumbs/ipynb_studio.html?path=${encodeURIComponent(path)}`}
          title={path.split("/").pop() ?? "cahier"} path={path} projectRoot={root} visible galleryDir="" />
      </div>
    </AppOverlays>,
  );
};
