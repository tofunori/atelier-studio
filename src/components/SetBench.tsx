// SetBench (plan 021) — banc de captures DÉTERMINISTES de la page Réglages.
// Monté par main.tsx sur #setbench[-section] ; DEFAULT_SETTINGS, ws null
// (notice « sidecar déconnecté » stable). Aucune donnée personnelle.
import { useEffect, useMemo, useState } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
// Bloc nav compacte/diagnostic/focus extrait vers un chunk lazy (perf lot 2,
// tâche 6) : le banc rend SettingsPage directement, hors SettingsSheet lazy,
// donc il doit l'importer lui-même (pas de budget de boot à préserver ici).
import "../styles/settings-sheet.css";
import SettingsPage from "./settings/SettingsPage";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import { OPENCODE_BENCH_ROUTES } from "./settings/openCodeBenchRoutes";

const noop = () => {};

// Faux socket LOCAL au banc (une vingtaine de lignes plutôt qu'un import
// depuis src/test/) : la page Réglages n'attend qu'un objet qui expose
// readyState/send/addEventListener et qui lui répond un `providerStatus`.
// Variante #setbench-opencode : sert l'échantillon réel du catalogue
// opencode (openCodeBenchRoutes.ts) pour que le routeur du lot B2 soit
// visible au banc — sans sidecar, sans réseau, déterministe.
function benchSocket(): WebSocket {
  const target = new EventTarget();
  const reply = (payload: unknown) => {
    setTimeout(() => target.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    ), 0);
  };
  const socket = {
    readyState: 1,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    send(raw: string) {
      const msg = JSON.parse(raw) as { type?: string; requestId?: string; rewrite?: { mode?: string; answers?: string } };
      if (msg.type === "reformulerConsigne") {
        const texte = msg.rewrite?.mode === "questions" && !msg.rewrite.answers
          ? "1. À quel public les figures sont-elles destinées ?\n2. Quel format d’export souhaitez-vous ?"
          : "Crée des figures scientifiques lisibles et sobres.\nVérifie les axes, les unités, les légendes et les chevauchements de texte.\nUtilise des couleurs accessibles et un export adapté à la publication.";
        setTimeout(() => window.dispatchEvent(new CustomEvent("consigne-reformulee", {
          detail: { requestId: msg.requestId, texte },
        })), 150);
      }
      if (msg.type === "providerStatus") {
        reply({
          type: "providerStatus",
          providers: [
            { id: "claude", label: "Claude Code", version: "2.4.1", ok: true, kind: "cli",
              models: ["claude-opus-5", "claude-sonnet-5"], efforts: ["low", "medium", "high"] },
            { id: "opencode", label: "opencode", version: "0.16.2", ok: true, kind: "cli",
              models: OPENCODE_BENCH_ROUTES.map((r) => r.id), efforts: [],
              routes: OPENCODE_BENCH_ROUTES },
          ],
        });
      }
      if (msg.type === "setupStatus") {
        reply({ type: "setupStatus", providers: [
          { id: "claude", auth: "ready" }, { id: "opencode", auth: "ready" },
        ] });
      }
      if (msg.type === "apiProviders") reply({ type: "apiProviders", providers: [] });
      // #setbench-memoire : souvenirs factices (aucune donnée personnelle).
      const memoire = (detail: Record<string, unknown>) => setTimeout(() => window.dispatchEvent(
        new CustomEvent("memoire-reponse", { detail: { requestId: msg.requestId, ok: true, ...detail } })), 0);
      if (msg.type === "memoryList") memoire({ total: 3, counts: { "/Users/demo/Chapitre1-Albedo": 3, "": 1 }, items: [
        { id: "m1", projectRoot: "/Users/demo/Chapitre1-Albedo", text: "Le dépôt de carbone suie du chapitre 1 est FireWork moins noFire, en mol m-2, sur la fenêtre JJA.",
          origin: { kind: "claude-science", sourceProject: "Analyses Feux-Albédo", evidence: "observed" }, createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:00:00.000Z" },
        { id: "m2", projectRoot: "/Users/demo/Chapitre1-Albedo", text: "Les figures suivent la largeur d'une colonne Nature (89 mm), texte de 7 pt au moins.",
          origin: { kind: "agent", threadId: "t1" }, createdAt: "2026-10-15T14:20:00.000Z", updatedAt: "2026-10-15T14:20:00.000Z" },
        { id: "m3", projectRoot: "/Users/demo/Chapitre1-Albedo", text: "Le modèle s'appelle RAQDPS dans le texte, jamais FireWork.",
          origin: { kind: "manual" }, createdAt: "2026-10-17T09:05:00.000Z", updatedAt: "2026-10-17T10:00:00.000Z", edited: true },
      ] });
      if (msg.type === "memoryClaudeSciencePreview") memoire({ base: "operon-cli.db", projects: [
        { id: "p1", name: "Analyses Feux-Albédo", count: 7671, imported: 0, projectRoot: null },
        { id: "p2", name: "Demande de bourse", count: 111, imported: 0, projectRoot: null },
        { id: "", name: "", count: 38, imported: 0, projectRoot: null },
      ] });
      if (msg.type === "importClaudeScience") {
        setTimeout(() => window.dispatchEvent(new CustomEvent("claude-science-import", { detail: {
          requestId: msg.requestId, ok: true, specialistes: [
            { cle: "REDACTEUR", nom: "Rédacteur corpus", role: "Rédaction scientifique en français", instructions: "Tu rédiges.",
              skills: ["redaction-article"], tousSkills: false, connecteurs: ["scholar"], actif: true, modifieLe: "" },
            { cle: "PAPER", nom: "Paper Writer", role: "", instructions: "Write papers.", skills: [], tousSkills: true,
              connecteurs: [], actif: false, modifieLe: "" },
          ],
        } })), 150);
      }
    },
  };
  return socket as unknown as WebSocket;
}

export function SetBench() {
  const hash = window.location.hash;
  useEffect(() => {
    // navigation de section pilotée par le hash pour les captures. La
    // section « Configuration » (setup) a fusionné dans « Modèles » (lot 1,
    // tâche 8) — le hash historique -setup vise donc désormais cette
    // section plutôt qu'un bouton de nav qui n'existe plus.
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>(".set-nav-item"));
    if (hash.includes("-specialistes")) {
      btns.find((b) => (b.textContent ?? "").includes("Spécialistes"))?.click();
      return;
    }
    if (hash.includes("-memoire")) {
      btns.find((b) => (b.textContent ?? "").includes("Mémoire"))?.click();
      return;
    }
    const target = hash.includes("-setup") ? "Modèles" : null;
    if (!target) return;
    btns.find((b) => (b.textContent ?? "").toLowerCase().includes("modèle") || (b.textContent ?? "").toLowerCase().includes("model"))?.click();
  }, [hash]);
  // #setbench-opencode : catalogue réel + réglages VIVANTS (épingler une
  // route doit se voir tout de suite, comme dans l'app), sinon la variante
  // historique reste figée sur DEFAULT_SETTINGS et un socket nul.
  const opencode = hash.includes("-opencode");
  const consignes = hash.includes("-consignes") || hash.includes("-specialistes") || hash.includes("-memoire");
  const ws = useMemo(() => (opencode || consignes ? benchSocket() : null), [opencode, consignes]);
  const [live, setLive] = useState<Settings>({ ...DEFAULT_SETTINGS, ...(consignes ? { consignes: [
    ...DEFAULT_SETTINGS.consignes,
    { id: "figure-bench", nom: "Figure", description: "Figures scientifiques prêtes pour publication", texte: "tu es un pro de création de figures scientifiques pour Nature. tu verifies les overlaps les labels, je veux des figures lisibles" },
  ] } : {}), ...(hash.includes("-specialistes") ? { specialistes: [
    { id: "sp1", nom: "Glaciologue albédo", nomCourt: "Glaciologue", role: "Albédo des glaciers, MODIS et Landsat",
      instructions: "Tu es glaciologue. Pars toujours des séries MODIS MOD10A1 et des stations au sol ; signale les jours nuageux.",
      skills: ["bilan-energie-fonte", "chaine-donnees-albedo"], tousSkills: false, connecteurs: ["scholar"], visible: true,
      origine: { source: "claude-science" as const, cle: "GLACIO", empreinte: "x" } },
    { id: "sp2", nom: "Analyste stats", nomCourt: "Stats", role: "Modèles bayésiens et tendances",
      instructions: "Tu es statisticien.", skills: [], tousSkills: true, connecteurs: [], visible: true },
  ] } : {}) });
  return (
    <div style={{ height: "100vh", display: "grid", background: "var(--bg)", color: "var(--text-primary)" }}>
      {opencode || consignes ? (
        <SettingsPage
          settings={live}
          onChange={(patch) => setLive((prev) => ({ ...prev, ...patch }))}
          onClose={noop}
          ws={ws}
          projects={hash.includes("-memoire") ? ["/Users/demo/Chapitre1-Albedo", "/Users/demo/Demande-bourse"] : undefined}
          projectRoot={hash.includes("-memoire") ? "/Users/demo/Chapitre1-Albedo" : undefined}
        />
      ) : (
        <SettingsPage settings={{ ...DEFAULT_SETTINGS }} onChange={noop} onClose={noop} ws={null} />
      )}
    </div>
  );
}
