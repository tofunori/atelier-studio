// Widget du fil (spec 2026-08-28) : panneau interactif écrit par un modèle,
// rendu dans une iframe close. Le châssis est celui de .codeblock —
// troisième membre de la famille avec .mermaid-block.
//
// sandbox="allow-scripts" SEUL : origine opaque, pas de localStorage/cookies,
// pas de navigation du parent. NE JAMAIS ajouter "allow-same-origin" —
// combiné à allow-scripts, le contenu (écrit par un modèle) pourrait retirer
// lui-même son propre bac à sable.
import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { getSidecarInfo, sidecarHeaders } from "../../lib/sidecarInfo";

export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;
export const WIDGET_READY_TIMEOUT_MS = 3000;

type Phase = "loading" | "live" | "mute" | "missing";

export function WidgetFrame(props: { event: WidgetEvent; threadId: string | null }) {
  const { event, threadId } = props;
  const [shell, setShell] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Chargement au montage : un widget jamais scrollé n'est jamais lu.
  // threadId absent (fil pas encore créé) : aucune requête possible, on va
  // directement à « introuvable » plutôt que de construire une URL avec
  // « null » dedans.
  useEffect(() => {
    if (threadId == null) {
      setPhase("missing");
      return;
    }
    const info = getSidecarInfo();
    if (info == null) {
      setPhase("missing");
      return;
    }
    let alive = true;
    const url = `http://127.0.0.1:${info.port}/widgets/${encodeURIComponent(threadId)}/${event.id}`;
    fetch(url, { headers: sidecarHeaders(info) })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((html) => { if (alive) setShell(html); })
      .catch(() => { if (alive) setPhase("missing"); });
    return () => { alive = false; };
  }, [event.id, threadId]);

  // Filet : une coquille qui ne dit jamais « ready » est déclarée muette.
  useEffect(() => {
    if (shell == null || phase !== "loading") return;
    const timer = setTimeout(() => setPhase((p) => (p === "loading" ? "mute" : p)), WIDGET_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [shell, phase]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source !== "atelier-widget") return;
      if (e.data.type === "ready") setPhase("live");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const chrome = (
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
  );

  // États dégradés : la hauteur est RENDUE au fil, jamais 400 px de vide.
  if (phase === "missing" || phase === "mute") {
    return (
      <div className="codeblock widget-block not-typeset">
        {chrome}
        <div className="widget-note">
          {phase === "missing" ? t("chat.widget-missing") : t("chat.widget-mute")}
        </div>
      </div>
    );
  }

  return (
    <div className="codeblock widget-block not-typeset">
      {chrome}
      {/* la hauteur est posée ICI, dès le premier rendu : LegendList mesure
          la bonne taille avant même que le HTML ne soit chargé */}
      <div className="widget-body" style={{ height: `${event.height}px` }}>
        {shell != null && (
          <iframe
            ref={frameRef}
            className={phase === "live" ? "widget-frame live" : "widget-frame"}
            title={event.title}
            sandbox="allow-scripts"
            srcDoc={shell}
          />
        )}
      </div>
    </div>
  );
}
