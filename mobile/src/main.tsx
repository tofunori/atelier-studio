import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./design/shadcn.css";
import "./design/tokens.css";
import "./design/mobile.css";

const WorkspacePreview = lazy(() => import("./preview/WorkspacePreview.tsx"));
const preview = new URLSearchParams(location.search).get("preview") === "workspace";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {preview ? <Suspense fallback={<p>Ouverture de l’aperçu…</p>}><WorkspacePreview /></Suspense> : <App />}
  </StrictMode>,
);
