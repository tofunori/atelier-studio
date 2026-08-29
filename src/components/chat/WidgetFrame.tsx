// Widget du fil (spec 2026-08-28) : panneau interactif écrit par un modèle,
// rendu dans une iframe close. Le châssis est celui de .codeblock —
// troisième membre de la famille avec .mermaid-block.
//
// sandbox="allow-scripts" SEUL : origine opaque, pas de localStorage/cookies,
// pas de navigation du parent. NE JAMAIS ajouter "allow-same-origin" —
// combiné à allow-scripts, le contenu (écrit par un modèle) pourrait retirer
// lui-même son propre bac à sable.
import { useEffect, useRef, useState } from "react";
import { Maximize2Icon, XIcon } from "lucide-react";
import type { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { getSidecarInfo, sidecarHeaders } from "../../lib/sidecarInfo";
import { forgetWidgetState, recallWidgetState, rememberWidgetState } from "./widgetState";
import { Button, IconButton } from "../ui";
import { CopyIcon } from "../icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../shadcn/dialog";
import { highlightCode } from "./md";

export type WidgetEvent = Extract<AgentEvent, { kind: "widget" }>;
export const WIDGET_READY_TIMEOUT_MS = 3000;
export const WIDGET_PROMPT_MAX = 2000;

type Phase = "loading" | "live" | "mute" | "missing";

// tokens poussés au widget : la seule palette qu'il aura
const THEME_TOKENS = ["--fg", "--fg2", "--muted", "--border", "--accent", "--bg-card"] as const;

function currentThemeMessage() {
  const styles = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of THEME_TOKENS) tokens[name] = styles.getPropertyValue(name).trim();
  tokens["--ui-font"] = styles.getPropertyValue("font-family").trim();
  return { source: "atelier-host", type: "theme", tokens };
}

export function WidgetFrame(props: { event: WidgetEvent; threadId: string | null }) {
  const { event, threadId } = props;
  const [shell, setShell] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  // Change de valeur pour REMONTER l'iframe (clé React). `setPhase("loading")`
  // ne suffit pas : même srcDoc, même élément — le widget garderait ses
  // curseurs alors qu'on vient justement d'oublier son état.
  const [mountNonce, setMountNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // miroir de `expanded` lisible depuis l'écouteur `message`, dont la clôture
  // est figée au premier rendu (deps = [event.id], pour ne pas ré-abonner à
  // chaque frappe et perdre un `ready` en vol).
  const expandedRef = useRef(false);

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
    setFrameUrl(url);
    // Le fetch ne sert plus qu'à la vue « source », au bouton copier et à la
    // détection « expiré » (404). L'iframe, elle, charge par src= : un
    // document srcdoc hériterait de la CSP de l'app (script-src 'self'), qui
    // bloquait tous les scripts inline de la coquille — widget muet.
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
    function post(msg: unknown) {
      frameRef.current?.contentWindow?.postMessage(msg, "*");
    }
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.source !== "atelier-widget") return;
      if (e.data.type === "ready") {
        post(currentThemeMessage());
        const frozen = recallWidgetState(event.id);
        post({ source: "atelier-host", type: "restore", state: frozen });
        setPhase("live");
      }
      if (e.data.type === "state") rememberWidgetState(event.id, e.data.state);
      // Échap relayé par la coquille : un keydown produit DANS une frame
      // d'origine opaque ne remonte pas au document parent, donc le
      // `onKeyDown` de la carte ne voyait rien tant que le focus était dans
      // l'iframe — le piège à clavier exact que la spec §F interdit. Le bras
      // passe par la MÊME garde de provenance que les autres.
      if (e.data.type === "escape") {
        // en plein écran, Échap ferme d'abord la modale : Radix ne voit pas
        // non plus la touche frappée dans la frame. L'iframe redescend alors
        // dans le fil, donc elle remonte — d'où le retour à "loading".
        if (expandedRef.current) {
          expandedRef.current = false;
          setExpanded(false);
          setPhase("loading");
        }
        cardRef.current?.focus();
      }
      if (e.data.type === "prompt") {
        const text = typeof e.data.text === "string" ? e.data.text.trim() : "";
        if (!text || text.length > WIDGET_PROMPT_MAX) return;
        window.dispatchEvent(new CustomEvent("chat-compose-append", { detail: { text } }));
      }
    }
    function onTheme() { post(currentThemeMessage()); }

    window.addEventListener("message", onMessage);
    window.addEventListener("app-theme-changed", onTheme);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("app-theme-changed", onTheme);
    };
  }, [event.id]);

  // Une SEULE iframe est jamais montée à la fois — le protocole postMessage
  // n'a qu'un interlocuteur (`frameRef`, filtré dans onMessage). Basculer
  // entre le fil et le plein écran REMONTE l'iframe (au lieu d'en dupliquer
  // une seconde, sans ref, dont le "ready" serait silencieusement rejeté) :
  // c'est voulu, c'est le rôle du gel d'état (tâche 8) de la faire
  // réapparaître à l'identique après avoir rejoué thème + restore.
  function renderIframe(className: string) {
    // shell garde son rôle de porte : tant que le fetch n'a pas prouvé que le
    // fichier existe (404 → « expiré »), on ne monte pas d'iframe.
    if (shell == null || frameUrl == null) return null;
    return (
      <iframe
        key={mountNonce}
        ref={frameRef}
        className={className}
        title={event.title}
        sandbox="allow-scripts"
        src={frameUrl}
      />
    );
  }

  // Un remontage d'iframe doit repartir de "loading" AVANT le prochain
  // rendu : sinon la classe .live (ou, plus grave, un ready jamais
  // reperdu) s'appliquerait à une iframe qui n'a pas encore redit "ready" —
  // on révélerait le widget avant de lui avoir renvoyé son état.
  function toggleSource() {
    setShowSource((v) => {
      const next = !v;
      if (!next && !expanded) setPhase("loading");
      return next;
    });
  }

  function setExpandedAndReload(next: boolean) {
    expandedRef.current = next;
    setExpanded(next);
    // en fermant, l'iframe ne remonte dans le fil que si la vue source
    // n'est pas affichée (sinon .widget-body ne rend aucune iframe).
    if (next || !showSource) setPhase("loading");
  }

  // spec §F : la réinitialisation vit dans la barre du plein écran. Elle
  // oublie l'état gelé de CE panneau (jamais celui des autres) et remonte
  // l'iframe pour repartir des valeurs par défaut.
  function resetWidget() {
    forgetWidgetState(event.id);
    setPhase("loading");
    setMountNonce((n) => n + 1);
  }

  const sourceToggle = (
    <Button
      variant="ghost"
      className="mermaid-toggle"
      disabled={shell == null}
      onClick={toggleSource}
    >
      {showSource ? t("chat.widget-view-panel") : t("chat.widget-view-source")}
    </Button>
  );

  const widgetLabel = (
    <span className="widget-bar-left">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
           strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <path d="M2 4.5h5M11 4.5h3M2 11.5h3M9 11.5h5" />
        <circle cx="9" cy="4.5" r="1.9" />
        <circle cx="7" cy="11.5" r="1.9" />
      </svg>
      <span className="widget-title">{event.title}</span>
    </span>
  );

  // États dégradés : la hauteur est RENDUE au fil, jamais 400 px de vide.
  //
  // En état MUET la coquille EST chargée — c'est justement l'état où pouvoir
  // lire le code compte le plus (spec §E : « ligne sobre + action voir la
  // source »). En état INTROUVABLE il n'y a rien à lire : aucune action.
  if (phase === "missing" || phase === "mute") {
    return (
      <div className="codeblock widget-block not-typeset">
        <div className="codeblock-bar">
          {widgetLabel}
          {phase === "mute" && shell != null && (
            <div className="codeblock-bar-actions">{sourceToggle}</div>
          )}
        </div>
        {showSource && shell != null ? (
          <pre>
            <code
              className="hljs language-html"
              dangerouslySetInnerHTML={{ __html: highlightCode(shell, "html") }}
            />
          </pre>
        ) : (
          <div className="widget-note">
            {phase === "missing" ? t("chat.widget-missing") : t("chat.widget-mute")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="codeblock widget-block not-typeset"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // sinon l'iframe est un piège à clavier — Tab y entre, rien n'en sort.
          (document.activeElement as HTMLElement | null)?.blur();
          cardRef.current?.focus();
        }
      }}
      tabIndex={-1}
    >
      <div className="codeblock-bar">
        {widgetLabel}
        <div className="codeblock-bar-actions">
          {sourceToggle}
          {!showSource && (
            <IconButton
              className="codeblock-copy"
              label={t("chat.widget-expand")}
              title={t("chat.widget-expand")}
              disabled={shell == null}
              onClick={() => setExpandedAndReload(true)}
            >
              <Maximize2Icon size={12} />
            </IconButton>
          )}
          <IconButton
            className={`codeblock-copy${copied ? " copied" : ""}`}
            label={copied ? t("chat.output-copied") : t("chat.output-copy")}
            title={copied ? t("chat.output-copied") : t("chat.output-copy")}
            disabled={shell == null}
            onClick={() => {
              void navigator.clipboard.writeText(shell ?? "").then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            <CopyIcon size={12} />
          </IconButton>
        </div>
      </div>
      {showSource ? (
        <pre>
          <code
            className="hljs language-html"
            dangerouslySetInnerHTML={{ __html: highlightCode(shell ?? "", "html") }}
          />
        </pre>
      ) : (
        // la hauteur est posée ICI, dès le premier rendu : LegendList mesure
        // la bonne taille avant même que le HTML ne soit chargé
        <div className="widget-body" style={{ height: `${event.height}px` }}>
          {/* le plein écran porte SEUL l'iframe pendant qu'il est ouvert —
              jamais deux à la fois (voir renderIframe). */}
          {!expanded && renderIframe(phase === "live" ? "widget-frame live" : "widget-frame")}
        </div>
      )}
      <Dialog open={expanded} onOpenChange={setExpandedAndReload}>
        {shell != null ? (
          <DialogContent
            showCloseButton={false}
            closeLabel={t("chat.mermaid-close-fullscreen")}
            overlayClassName="tw:bg-black/70 tw:backdrop-blur-sm"
            className="mermaid-fullscreen-dialog tw:fixed tw:flex tw:max-w-none tw:translate-x-0 tw:translate-y-0 tw:flex-col tw:gap-0 tw:p-0 tw:ring-0"
            style={{
              inset: 12,
              top: 12,
              left: 12,
              width: "calc(100dvw - 24px)",
              height: "calc(100dvh - 24px)",
              maxWidth: "none",
              transform: "none",
              translate: "none",
            }}
          >
            <DialogTitle className="tw:sr-only">{t("chat.widget-fullscreen-title")}</DialogTitle>
            <div className="mermaid-fullscreen-toolbar">
              <span className="widget-title">{event.title}</span>
              <span className="widget-fullscreen-actions">
                <Button variant="ghost" className="mermaid-toggle" onClick={resetWidget}>
                  {t("chat.widget-reset")}
                </Button>
                <DialogClose
                  className="mermaid-fullscreen-close"
                  aria-label={t("chat.mermaid-close-fullscreen")}
                >
                  <XIcon aria-hidden="true" />
                  <span className="tw:sr-only">{t("chat.mermaid-close-fullscreen")}</span>
                </DialogClose>
              </span>
            </div>
            {expanded && renderIframe("widget-fullscreen-frame")}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
