// WsBench (plan 018) — banc de captures DÉTERMINISTES des surfaces de la
// hiérarchie workspace : ChatHeader (statuts, titre long), GalleryHeader,
// DocumentHeader, ContextInspector (idle/added). Monté par main.tsx sur
// #wsbench[-light] ; jamais dans le parcours normal (chunk lazy).
import { useEffect, useState } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import { ChatHeader } from "./chat/ChatHeader";
import { GalleryHeader, DocumentHeader } from "./AtelierHeaders";
import { ContextInspector, type InspectedFile } from "./ContextInspector";
import { presentStatus } from "../lib/statusPresentation";

const NOW = Date.parse("2026-07-09T18:00:00Z");

const FILE: InspectedFile = {
  rel: "figures/albedo_saisonnier_2000_2025.pdf",
  name: "albedo_saisonnier_2000_2025.pdf",
  dir: "figures",
  kind: "figure",
  projectRoot: "/Users/tofunori/Documents/these-albedo",
  projectName: "Thèse albédo — glaciers de l'Ouest",
};

function Card(p: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-surface)", overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "var(--sp-2) var(--sp-4)", fontSize: "var(--fs-caption)",
        textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)" }}>{p.title}</div>
      {p.children}
    </section>
  );
}

export function WsBench() {
  const light = window.location.hash.includes("-light");
  const [addState, setAddState] = useState<"idle" | "pending" | "added">(
    window.location.hash.includes("-added") ? "added" : "idle",
  );
  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-app)", padding: "var(--sp-6)",
      display: "grid", gridTemplateColumns: "minmax(0, 2fr) 320px", gap: "var(--sp-5)",
      fontFamily: "var(--font-chrome)", color: "var(--text-primary)", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", minWidth: 0 }}>
        <Card title="ChatHeader — terminé">
          <ChatHeader title="Rewrap figure 3 — albédo saisonnier" provider="claude"
            projectName="Thèse albédo" projectPath="/Users/tofunori/Documents/these-albedo"
            status={presentStatus({ kind: "done", now: NOW })} />
        </Card>
        <Card title="ChatHeader — en cours (durée)">
          <ChatHeader title="Analyse tendance albédo 2000–2025" provider="codex"
            projectName="Thèse albédo" status={presentStatus({ kind: "running", since: NOW - 272_000, now: NOW })} />
        </Card>
        <Card title="ChatHeader — interrompu + titre très long (troncature, nom accessible complet)">
          <ChatHeader
            title="Extraction Google Earth Engine MOD10A1 v6.1 — albédo de neige quotidien, glaciers de l'Ouest canadien, saisons de fonte 2000–2025, reprojection EPSG:3413"
            provider="claude" projectName="Thèse albédo"
            status={presentStatus({ kind: "interrupted", detail: "Quota Earth Engine dépassé (429)", now: NOW })} />
        </Card>
        <Card title="GalleryHeader (refresh migré de la TopBar ; pas d'eyebrow — le crumb porte déjà le projet)">
          <GalleryHeader projectName={null} onRefresh={() => {}} />
        </Card>
        <Card title="DocumentHeader (type dérivé + accès clavier à l'inspecteur)">
          <DocumentHeader rel="figures/albedo_saisonnier_2000_2025.pdf" onInspect={() => setAddState("idle")} />
        </Card>
      </div>
      <div style={{ height: 560, display: "flex" }}>
        <ContextInspector
          item={FILE}
          onClose={() => {}}
          onOpen={() => {}}
          onAddToChat={() => setAddState("added")}
          addState={addState}
        />
      </div>
    </div>
  );
}
