// Widget du fil (spec 2026-08-28) : panneau interactif écrit par un modèle,
// rendu dans une iframe close. Le châssis est celui de .codeblock —
// troisième membre de la famille avec .mermaid-block.
import type { AgentEvent } from "../../lib/ws";

export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;

export function WidgetFrame(props: { event: WidgetEvent; threadId: string | null }) {
  const { event } = props;
  return (
    <div className="codeblock widget-block not-typeset">
      <div className="codeblock-bar">
        <span className="widget-bar-left">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2 4.5h5M11 4.5h3M2 11.5h3M9 11.5h5" />
            <circle cx="9" cy="4.5" r="1.9" />
            <circle cx="7" cy="11.5" r="1.9" />
          </svg>
          <span className="widget-title">{event.title}</span>
        </span>
      </div>
      {/* la hauteur est posée ICI, dès le premier rendu : LegendList mesure
          la bonne taille avant même que le HTML ne soit chargé */}
      <div className="widget-body" style={{ height: `${event.height}px` }} />
    </div>
  );
}
