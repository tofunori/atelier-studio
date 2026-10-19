// Banc visuel de la surface Documents. Activé uniquement par
// VITE_VISUAL_BENCH=1 + #docsbench[-light][-new][&g=<galerie>] ; la liste
// est simulée, le document ouvert vient d'une galerie réelle si `g` est donné.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../styles/shadcn.css";
import "../App.css";
import { applyAppearance, themeMessage } from "../lib/appTheme";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { setLanguage } from "../lib/i18n";
import DocumentsSurface from "./DocumentsSurface";

const HASH = window.location.hash;
const LIGHT = HASH.includes("-light");
const GALLERY = new URLSearchParams(HASH.split("&").slice(1).join("&")).get("g") || "http://127.0.0.1:1";
const NOW = Date.now();
const DAY = 86_400_000;
const DOCS = [
  { path: "manuscrit/Chapitre1_brouillon.docx", mtime: NOW - 2 * 3600_000, changes: 3 },
  { path: "corrections/Chapitre 2 corrigé CK.docx", mtime: NOW - DAY, changes: 11 },
  { path: "documents/Lettre de réponse aux relecteurs.docx", mtime: NOW - 7 * DAY, changes: 0 },
  { path: "documents/Plan de thèse.docx", mtime: NOW - 17 * DAY, changes: 0 },
  { path: "documents/Demande de bourse FRQNT.docx", mtime: NOW - 21 * DAY, changes: 0 },
];
const OPEN = new URLSearchParams(HASH.split("&").slice(1).join("&")).get("open");

setLanguage("fr");

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/docx/list")) return new Response(JSON.stringify({ documents: DOCS }));
  return realFetch(input, init);
}) as typeof fetch;

try {
  const root = "/bench";
  localStorage.setItem(`atelier-studio.documents.recent:${root}`, JSON.stringify(DOCS.slice(0, 3).map((d) => d.path)));
  localStorage.setItem(`atelier-studio.documents.tabs:${root}`, JSON.stringify(OPEN ? [OPEN, DOCS[1].path] : []));
} catch { /* stockage indisponible */ }

export function DocumentsBench() {
  useEffect(() => {
    const settings = { ...DEFAULT_SETTINGS, theme: LIGHT ? "light" as const : "dark" as const };
    const stop = applyAppearance(settings, "bench");
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "atelier-theme-request" && e.source) (e.source as Window).postMessage(themeMessage(settings, "bench"), e.origin);
    };
    window.addEventListener("message", onMsg);
    if (HASH.includes("-new")) window.setTimeout(() => (document.querySelector(".docs-new") as HTMLElement | null)?.click(), 400);
    return () => { stop(); window.removeEventListener("message", onMsg); };
  }, []);
  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--surface-canvas)", color: "var(--text-primary)", fontFamily: "var(--font-chrome)" }}>
      <DocumentsSurface galleryUrl={`${GALLERY}/figures_index.html#atelier_nonce=bench`} projectRoot="/bench" visible />
    </div>
  );
}
