"use client";

import { useState } from "react";

type Surface = {
  id: string;
  index: string;
  label: string;
  kicker: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  bullets: string[];
};

const surfaces: Surface[] = [
  {
    id: "chat",
    index: "01",
    label: "Agent chat",
    kicker: "Claude + Codex, side by side",
    title: "Steer serious work without losing the thread.",
    description: "Resume native CLI sessions, switch providers in place, attach files and images, set goals, inspect tool runs, and keep control of every turn.",
    image: "/chat-workspace.png",
    imageAlt: "Atelier Studio multi-agent chat workspace",
    bullets: ["Session resume, fork and revert", "Goals, steering and stop controls", "Citations, images, diffs and usage"],
  },
  {
    id: "gallery",
    index: "02",
    label: "Scientific atelier",
    kicker: "Figures become working material",
    title: "Inspect, compare and annotate every output.",
    description: "A project-aware gallery keeps figures, documents and drafts close to the conversation. Search, filter, favorite, annotate, edit, and send any useful context back to the agent.",
    image: "/atelier-gallery.png",
    imageAlt: "Atelier Studio scientific figure gallery",
    bullets: ["PDF, SVG and image viewers", "LaTeX, Markdown and code editors", "Persistent annotations and Add to chat"],
  },
  {
    id: "library",
    index: "03",
    label: "Zotero library",
    kicker: "References stay in the workflow",
    title: "Find the paper, read it, cite it.",
    description: "Search your local Zotero library, browse collections, open attached PDFs, manage favorites, and insert citekeys or full references directly into the active conversation.",
    image: "/library-zotero.png",
    imageAlt: "Atelier Studio Zotero library and PDF reader",
    bullets: ["Local search and collections", "Citekeys, BibTeX and favorites", "PDF import, reader and chat insertion"],
  },
  {
    id: "projects",
    index: "04",
    label: "Project memory",
    kicker: "One workspace per body of work",
    title: "Projects, sessions and highlights stay organized.",
    description: "Keep conversation history scoped to the right folder, resume prior runs, pin favorites, collect durable highlights, and move between projects without rebuilding context.",
    image: "/sidebar-projects.png",
    imageAlt: "Atelier Studio project and session navigation",
    bullets: ["Project-scoped conversations", "Favorites, recents and session resume", "Searchable highlights with Markdown export"],
  },
];

export function SurfaceExplorer() {
  const [activeSurface, setActiveSurface] = useState(surfaces[0]);

  return (
    <>
      <div className="surface-selector" role="tablist" aria-label="Explore Atelier Studio surfaces">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            role="tab"
            aria-selected={activeSurface.id === surface.id}
            aria-controls="surface-panel"
            className={activeSurface.id === surface.id ? "surface-tab is-active" : "surface-tab"}
            onClick={() => setActiveSurface(surface)}
          >
            <span>{surface.index}</span>
            {surface.label}
          </button>
        ))}
      </div>

      <div className={`surface-panel surface-${activeSurface.id}`} id="surface-panel" role="tabpanel" aria-live="polite">
        <div className="surface-copy">
          <span className="surface-kicker">{activeSurface.kicker}</span>
          <h3>{activeSurface.title}</h3>
          <p>{activeSurface.description}</p>
          <ul>{activeSurface.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        </div>
        <div className="surface-image-wrap">
          <span className="image-coordinate" aria-hidden="true">SURFACE / {activeSurface.index}</span>
          <img src={activeSurface.image} alt={activeSurface.imageAlt} />
        </div>
      </div>
    </>
  );
}
