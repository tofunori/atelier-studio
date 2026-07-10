// HomeBench (plan 017) — banc de captures DÉTERMINISTES du Research Home.
// Monté par main.tsx sur #homebench[-état][-light] ; jamais dans le parcours
// normal (chunk lazy). Les fixtures passent par le VRAI deriveResearchHomeModel
// (le banc exerce la couche de sélection, pas un rendu parallèle).
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import { deriveResearchHomeModel, type ResearchHomeInputs } from "../lib/researchHome";
import { ResearchHome, type ResearchHomeActions } from "./ResearchHome";
import type { Thread } from "../lib/ws";

const NOW = Date.parse("2026-07-09T18:00:00Z");
const PROJ = "/Users/tofunori/Documents/these-albedo";

const noop = () => {};
const ACTIONS: ResearchHomeActions = {
  onNewChat: noop, onOpenProject: noop, onResume: noop, onOpenArtefact: noop,
  onOpenGallery: noop, onOpenPalette: noop, onResumeSession: noop,
};

function th(partial: Partial<Thread> & { id: string; title: string }): Thread {
  return { projectRoot: PROJ, provider: "claude", sessionId: null, status: "idle",
    updatedAt: "2026-07-09T17:20:00Z", ...partial };
}

const ARTEFACTS = [
  "figures/albedo_saisonnier_2000_2025.pdf",
  "figures/tendance_mod10a1_ete.png",
  "scripts/extraction_gee_albedo.py",
  "chapitres/ch3_methodologie.tex",
  "data/albedo_glaciers_ouest.csv",
  "notes/reunion_direction_2026-07-07.md",
];

const BASE: ResearchHomeInputs = {
  activeProject: PROJ,
  projectName: "Thèse albédo — glaciers de l'Ouest",
  threads: [],
  events: {},
  workingSince: {},
  usageByThread: {},
  recentFiles: [],
  files: ARTEFACTS,
  sidecar: "ready",
  atelierError: null,
  now: NOW,
};

/** États de capture exigés par le plan 017 (§ Contrôle visuel). */
const STATES: Record<string, Partial<ResearchHomeInputs>> = {
  // 1512×883 dark — historique riche
  rich: {
    threads: [
      th({ id: "a", title: "Rewrap figure 3 — albédo saisonnier", status: "done", updatedAt: "2026-07-09T17:32:00Z" }),
      th({ id: "b", title: "Extraction GEE MOD10A1 (2024)", updatedAt: "2026-07-09T14:05:00Z" }),
      th({ id: "c", title: "Relecture chapitre 3", status: "done", updatedAt: "2026-07-08T21:10:00Z" }),
    ],
    events: {
      a: [{ kind: "done", ok: true, result: "Figure 3 rewrappée : légende à 92 caractères, export PDF regénéré." }],
      b: [{ kind: "error", message: "Quota Earth Engine dépassé (429) — reprise possible." }],
    },
    usageByThread: { a: { context: 84000, output: 2100, cost: 0.42, turns: 6 } },
    recentFiles: ARTEFACTS,
  },
  // 1512×883 light — sans erreur (aucun élément À traiter)
  clean: {
    threads: [
      th({ id: "a", title: "Rewrap figure 3 — albédo saisonnier", status: "done", updatedAt: "2026-07-09T17:32:00Z" }),
      th({ id: "c", title: "Relecture chapitre 3", status: "done", updatedAt: "2026-07-08T21:10:00Z" }),
    ],
    events: {
      a: [{ kind: "done", ok: true, result: "Figure 3 rewrappée : légende à 92 caractères, export PDF regénéré." }],
    },
    usageByThread: { a: { context: 84000, output: 2100, cost: 0.42, turns: 6 } },
    recentFiles: ARTEFACTS,
  },
  // 1280×800 dark — tour en cours
  running: {
    threads: [
      th({ id: "r", title: "Analyse tendance albédo 2000–2025", status: "running", updatedAt: "2026-07-09T17:55:00Z" }),
      th({ id: "a", title: "Rewrap figure 3", status: "done", updatedAt: "2026-07-09T17:58:00Z" }),
    ],
    workingSince: { r: NOW - 272_000 },
    recentFiles: ARTEFACTS.slice(0, 4),
  },
  // 800×600 dark — projet sans thread (pas une erreur)
  "empty-project": {
    recentFiles: ARTEFACTS.slice(0, 2),
  },
  // zéro projet
  "no-project": { activeProject: null },
  // erreur sidecar : connexion PERDUE + un thread interrompu distinct du plus
  // récent (À traiter montre l'alerte ET l'interrompu, sans doublon Continuer)
  sidecar: {
    sidecar: "disconnected",
    threads: [
      th({ id: "ok", title: "Relecture chapitre 3", status: "done", updatedAt: "2026-07-09T17:10:00Z" }),
      th({ id: "b", title: "Extraction GEE MOD10A1 (2024)", updatedAt: "2026-07-09T16:40:00Z" }),
    ],
    events: {
      ok: [{ kind: "done", ok: true, result: "Relecture terminée, 12 corrections." }],
      b: [{ kind: "error", message: "Sidecar arrêté pendant le tour." }],
    },
    recentFiles: ARTEFACTS.slice(0, 3),
  },
  // démarrage à froid : squelette sobre (plan 017 § Chargement)
  loading: { sidecar: "connecting" },
};

export function HomeBench() {
  const hash = window.location.hash;
  const light = hash.includes("-light");
  const key = Object.keys(STATES).find((k) => hash.includes(`-${k}`)) ?? "rich";

  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);

  const model = deriveResearchHomeModel({ ...BASE, ...STATES[key] });
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-app)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex" }}>
        <ResearchHome model={model} actions={ACTIONS} />
      </div>
    </div>
  );
}
