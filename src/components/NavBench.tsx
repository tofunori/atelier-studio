// NavBench (plan 024) — banc de captures DÉTERMINISTES du panneau Projets
// (Research Navigator). Monté par main.tsx sur #navbench[-état][-wNNN][-light] ;
// jamais dans le parcours normal (chunk lazy). Le banc rend le VRAI Sidebar
// avec des fixtures figées : aucun sidecar requis.
// États : rich (défaut) · empty · unscoped. Largeurs : -w220 · -w180.
import { useEffect } from "react";
import "../styles/tokens.css";
import "../styles/primitives.css";
import "../App.css";
import Sidebar from "./Sidebar";
import type { Thread } from "../lib/ws";

const PROJ = "/Users/tofunori/Documents/these-albedo";
const OTHER = "/Users/tofunori/Documents/manuscrit-ch1";

// horodatages relatifs au chargement : buckets stables pour une capture
const NOW = Date.now();
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function th(partial: Partial<Thread> & { id: string; title: string }): Thread {
  return {
    projectRoot: PROJ, provider: "claude", sessionId: "s-" + partial.id,
    status: "idle", updatedAt: hoursAgo(1), ...partial,
  };
}

const RICH: Thread[] = [
  th({ id: "run", title: "Analyse tendance albédo 2000–2025", status: "running", updatedAt: hoursAgo(0.1) }),
  th({ id: "a", title: "Rewrap figure 3 — albédo saisonnier", updatedAt: hoursAgo(1) }),
  th({ id: "b", title: "Extraction GEE MOD10A1 (2024)", provider: "codex", updatedAt: hoursAgo(3) }),
  th({ id: "c", title: "Méthodologie — forçage aérosols", updatedAt: daysAgo(1.1) }),
  th({ id: "d", title: "Relecture chapitre 3", updatedAt: daysAgo(1.3) }),
  th({ id: "e", title: "Validation Williamson & Menounos", provider: "codex", updatedAt: daysAgo(3) }),
  th({ id: "f", title: "Carte régions RGI — popups", updatedAt: daysAgo(5) }),
  th({ id: "g", title: "Sensibilité gf_dyn : notes", updatedAt: daysAgo(12) }),
  th({ id: "h", title: "Nettoyage DuckDB par région", updatedAt: daysAgo(20) }),
  th({ id: "i", title: "Bibliographie feux de forêt", updatedAt: daysAgo(30) }),
  th({ id: "x1", title: "Chat d'un autre projet", projectRoot: OTHER, updatedAt: hoursAgo(2) }),
];

const UNSCOPED: Thread[] = [
  th({ id: "u1", title: "Idées de titres pour l'article", projectRoot: "", updatedAt: hoursAgo(2) }),
  th({ id: "u2", title: "Question stats — modèles mixtes", projectRoot: "", provider: "codex", updatedAt: daysAgo(2) }),
  th({ id: "u3", title: "Brouillon courriel direction", projectRoot: "", updatedAt: daysAgo(9) }),
];

const noop = () => {};

type BenchState = {
  activeProject: string | null;
  threads: Thread[];
  activeId: string | null;
  favorites: string[];
  unread: Set<string>;
};

const STATES: Record<string, BenchState> = {
  // 1512×883 / 800×600 : projet actif, 10 conversations, running/unread/actif/favoris
  rich: {
    activeProject: PROJ,
    threads: RICH,
    activeId: "a",
    favorites: ["c", "e"],
    unread: new Set(["b"]),
  },
  // projet sans conversation
  empty: {
    activeProject: PROJ,
    threads: [th({ id: "x1", title: "Chat d'un autre projet", projectRoot: OTHER })],
    activeId: null,
    favorites: [],
    unread: new Set(),
  },
  // chats sans projet
  unscoped: {
    activeProject: null,
    threads: [...UNSCOPED, RICH[1]],
    activeId: "u1",
    favorites: ["u2"],
    unread: new Set(),
  },
};

export function NavBench() {
  const hash = window.location.hash;
  const light = hash.includes("-light");
  const key = Object.keys(STATES).find((k) => hash.includes(`-${k}`)) ?? "rich";
  const width = hash.includes("-w180") ? 180 : hash.includes("-w220") ? 220 : 250;
  const state = STATES[key];

  useEffect(() => {
    if (light) document.documentElement.setAttribute("data-theme", "light");
    return () => document.documentElement.removeAttribute("data-theme");
  }, [light]);

  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--bg)", color: "var(--fg)" }}>
      {/* rail 48 px factice : le sujet du banc est le panneau */}
      <div style={{ width: 48, flex: "none", background: "var(--bg-side)", borderRight: "1px solid var(--border)" }} />
      <div className="side-fixed" style={{ width }}>
        <Sidebar
          projects={[PROJ, OTHER]}
          threads={state.threads}
          unread={state.unread}
          favorites={state.favorites}
          onToggleFavorite={noop}
          threadOrder="recent"
          activeProject={state.activeProject}
          activeId={state.activeId}
          onSelect={noop}
          onNew={noop}
          onNewChat={noop}
          onImportSession={noop}
          onDelete={noop}
          onRemoveProject={noop}
          onRename={noop}
          onSettings={noop}
          projMeta={{ [PROJ]: { color: "#7aa2f7", label: "icon:mountain" }, [OTHER]: { color: "#98c379" } }}
          onSetMeta={noop}
        />
      </div>
      <div className="handle" style={{ flex: "none" }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--muted2)", fontSize: "var(--fs-m)" }}>
        surface de travail (hors banc)
      </div>
    </div>
  );
}
