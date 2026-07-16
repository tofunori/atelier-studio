// Rendu des diagrammes Mermaid dans les messages finaux (JAMAIS en
// streaming — voir Chat.tsx : MD_COMPONENTS_STREAMING garde le bloc de code
// en clair). Intégration par composant custom (pas rehype-mermaid, pas de
// plugin remark) : on intercepte language-mermaid dans le composant `pre`.
//
// Décisions (cf. docs/superpowers/specs/2026-07-08-markdown-mermaid-polish.md) :
// - import("mermaid") dynamique, promesse module-level partagée (lazy, jamais
//   dans le chunk principal — vite code-split automatiquement les import()).
// - Validation avant rendu (mermaid.parse suppressErrors) puis try/catch
//   autour du render quand même (Open WebUI #18340/#2776 : un diagramme
//   invalide qui "réussit" à parser peut planter/geler au render). Le SVG
//   d'erreur rouge de mermaid n'est jamais affiché — repli sur le bloc de
//   code normal + mention sobre.
// - securityLevel "strict" (contenu LLM non fiable) + htmlLabels false (bug
//   WebKit foreignObject #23113 sous WKWebView).
// - Theming : mermaid ne lit pas les variables CSS (issue mermaid #6677) —
//   palette résolue à l'exécution via resolveToken (getComputedStyle en
//   prod, mocké en test).
// - Cache module-level borné par hash(source)+signature de thème : les
//   re-renders de la liste (chaque event ajouté re-rend tous les messages)
//   ne doivent jamais relancer mermaid sur un diagramme inchangé.

import { useEffect, useRef, useState } from "react";
import { Maximize2Icon, XIcon } from "lucide-react";
import { LruCache } from "../lib/lruCache";
import { t } from "../lib/i18n";
import { CopyIcon } from "./icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./shadcn/dialog";

// ============================================================
// Helpers purs — exportés pour test (sidecar/mermaid.test.mjs)
// ============================================================

/**
 * Hash FNV-1a 32-bit du source : stable (pas de Math.random ni compteur),
 * même source => même hash toujours. Sert d'id DOM de rendu et de clé de
 * cache.
 */
export function hashMermaidSource(source: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Résout une variable CSS projet (injectable — getComputedStyle en prod). */
export type ResolveToken = (name: string) => string;

// Tokens lus pour construire la palette mermaid ET la signature de thème.
const THEME_TOKEN_NAMES = ["--bg-side", "--fg2", "--muted", "--border", "--border2", "--accent"] as const;

/**
 * Concat des couleurs résolues : si elle change entre deux rendus (bascule
 * clair/sombre), mermaid doit être ré-initialisé avant de re-render.
 */
export function mermaidThemeSignature(resolveToken: ResolveToken): string {
  return THEME_TOKEN_NAMES.map((name) => resolveToken(name).trim()).join("|");
}

/**
 * Construit les themeVariables mermaid (theme "base") depuis les tokens
 * projet résolus. Palette sobre : fond --bg-side, traits/texte
 * --fg2/--muted, accent --accent avec parcimonie (bordures actives
 * seulement). Aucun hex en dur ici — tout vient de resolveToken.
 */
export function buildMermaidThemeVariables(resolveToken: ResolveToken): Record<string, string> {
  const bg = resolveToken("--bg-side").trim();
  const fg2 = resolveToken("--fg2").trim();
  const muted = resolveToken("--muted").trim();
  const border = resolveToken("--border").trim();
  const border2 = resolveToken("--border2").trim();
  const accent = resolveToken("--accent").trim();
  return {
    background: bg,
    fontFamily: "inherit",
    primaryColor: bg,
    primaryTextColor: fg2,
    primaryBorderColor: border2,
    secondaryColor: bg,
    secondaryTextColor: fg2,
    secondaryBorderColor: border,
    tertiaryColor: bg,
    tertiaryTextColor: fg2,
    tertiaryBorderColor: border,
    lineColor: muted,
    textColor: fg2,
    mainBkg: bg,
    nodeBorder: border2,
    clusterBkg: bg,
    clusterBorder: border,
    defaultLinkColor: muted,
    titleColor: fg2,
    edgeLabelBackground: bg,
    actorBkg: bg,
    actorBorder: border2,
    actorTextColor: fg2,
    actorLineColor: muted,
    signalColor: muted,
    signalTextColor: fg2,
    labelBoxBkgColor: bg,
    labelBoxBorderColor: border,
    labelTextColor: fg2,
    loopTextColor: fg2,
    noteBorderColor: border,
    noteBkgColor: bg,
    noteTextColor: fg2,
    activationBorderColor: accent,
    activationBkgColor: bg,
    sectionBkgColor: bg,
    altSectionBkgColor: bg,
    gridColor: border,
    taskBorderColor: border2,
    taskBkgColor: bg,
    taskTextColor: fg2,
    activeTaskBorderColor: accent,
    activeTaskBkgColor: bg,
    doneTaskBkgColor: bg,
    doneTaskBorderColor: border,
    critBorderColor: accent,
    critBkgColor: bg,
    todayLineColor: accent,
  };
}

// Cache module-level borné (svg déjà rendu) : clé = hash(source) + signature
// de thème. Cap 50, éviction LRU (même mécanisme que highlightCache dans
// Chat.tsx).
const MERMAID_SVG_CACHE_SIZE = 50;
export const mermaidSvgCache = new LruCache<string>(MERMAID_SVG_CACHE_SIZE);

export function mermaidCacheKey(source: string, themeSignature: string): string {
  return `${hashMermaidSource(source)}:${themeSignature}`;
}

/**
 * Certains diagrammes "invalides" réussissent quand même à render en
 * dessinant l'icône d'erreur mermaid — jamais l'afficher (cf. spec).
 * Cherche "error-icon" comme classe à part entière (séparée par des espaces)
 * dans un attribut class="...", pas comme simple sous-chaîne.
 */
export function containsMermaidErrorIcon(svg: string): boolean {
  return /class="(?:[^"]*\s)?error-icon(?:\s[^"]*)?"/.test(svg);
}

// ============================================================
// Partie impure : chargement paresseux + rendu mermaid
// ============================================================

type MermaidNamespace = typeof import("mermaid");
type MermaidInstance = MermaidNamespace["default"];

// Promesse module-level partagée : un seul import("mermaid") pour toute la
// session, même si plusieurs diagrammes sont rencontrés en parallèle.
let mermaidModulePromise: Promise<MermaidNamespace> | null = null;
function loadMermaidModule(): Promise<MermaidNamespace> {
  if (!mermaidModulePromise) mermaidModulePromise = import("mermaid");
  return mermaidModulePromise;
}

function resolveCssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

let initializedThemeSignature: string | null = null;

function ensureMermaidInitialized(mermaid: MermaidInstance, themeSignature: string) {
  if (initializedThemeSignature === themeSignature) return;
  mermaid.initialize({
    startOnLoad: false,
    // contenu généré par un LLM = non fiable.
    securityLevel: "strict",
    // bug WebKit foreignObject #23113 : les labels HTML se positionnent mal
    // sous Safari/WKWebView — forcer les labels SVG natifs.
    htmlLabels: false,
    theme: "base",
    themeVariables: buildMermaidThemeVariables(resolveCssToken),
  });
  initializedThemeSignature = themeSignature;
}

type RenderState = { status: "loading" } | { status: "ready"; svg: string } | { status: "invalid" };

async function renderMermaidDiagram(source: string): Promise<RenderState> {
  try {
    const mod = await loadMermaidModule();
    const mermaid = mod.default;
    const themeSignature = mermaidThemeSignature(resolveCssToken);
    const cacheKey = mermaidCacheKey(source, themeSignature);
    const cached = mermaidSvgCache.get(cacheKey);
    if (cached !== undefined) return { status: "ready", svg: cached };

    // validation avant rendu — jamais le SVG d'erreur rouge de mermaid.
    const parseResult = await mermaid.parse(source, { suppressErrors: true });
    if (!parseResult) return { status: "invalid" };

    ensureMermaidInitialized(mermaid, themeSignature);
    const id = `mermaid-svg-${hashMermaidSource(source)}`;
    const { svg } = await mermaid.render(id, source);
    if (containsMermaidErrorIcon(svg)) return { status: "invalid" };

    mermaidSvgCache.set(cacheKey, svg);
    return { status: "ready", svg };
  } catch {
    // un diagramme invalide qui parvient quand même à planter/geler le
    // render (Open WebUI #18340/#2776) ne doit jamais remonter jusqu'à React.
    return { status: "invalid" };
  }
}

// ============================================================
// Composant
// ============================================================

export type MermaidBlockProps = {
  source: string;
  /** Coloration syntaxique injectée depuis Chat.tsx (même cache/hljs que les
   * autres blocs de code) — évite un import circulaire avec Chat.tsx. */
  highlight: (raw: string, lang: string) => string;
};

type ViewMode = "diagram" | "code";

export function MermaidBlock({ source, highlight }: MermaidBlockProps) {
  const [state, setState] = useState<RenderState>({ status: "loading" });
  const [mode, setMode] = useState<ViewMode>("diagram");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // rendu initial / re-render si le source change (guard "toujours monté").
  useEffect(() => {
    setState({ status: "loading" });
    void renderMermaidDiagram(source).then((next) => {
      if (mountedRef.current) setState(next);
    });
  }, [source]);

  // le SVG bake les couleurs résolues : un changement de thème (clair/sombre)
  // doit re-render (même pattern que Terminal.tsx pour xterm).
  useEffect(() => {
    const onTheme = () => {
      void renderMermaidDiagram(source).then((next) => {
        if (mountedRef.current) setState(next);
      });
    };
    window.addEventListener("app-theme-changed", onTheme);
    return () => window.removeEventListener("app-theme-changed", onTheme);
  }, [source]);

  const ready = state.status === "ready";

  return (
    <div className="codeblock mermaid-block not-typeset">
      <div className="codeblock-bar">
        <span className="codeblock-lang">mermaid</span>
        <div className="codeblock-bar-actions">
          {ready && (
            <>
              <button
                type="button"
                className="mermaid-toggle"
                onClick={() => setMode((m) => (m === "diagram" ? "code" : "diagram"))}
              >
                {mode === "diagram" ? t("chat.mermaid-view-code") : t("chat.mermaid-view-diagram")}
              </button>
              {mode === "diagram" && (
                <button
                  type="button"
                  className="codeblock-copy mermaid-expand"
                  title={t("chat.mermaid-expand")}
                  aria-label={t("chat.mermaid-expand")}
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2Icon size={12} />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={`codeblock-copy${copied ? " copied" : ""}`}
            title={copied ? t("chat.output-copied") : t("chat.output-copy")}
            aria-label={copied ? t("chat.output-copied") : t("chat.output-copy")}
            onClick={() => {
              void navigator.clipboard.writeText(source).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            <CopyIcon size={12} />
          </button>
        </div>
      </div>
      {mode === "diagram" && state.status === "ready" ? (
        <div className="mermaid-svg-wrap" dangerouslySetInnerHTML={{ __html: state.svg }} />
      ) : (
        <>
          <pre>
            <code
              className="hljs language-mermaid"
              dangerouslySetInnerHTML={{ __html: highlight(source, "mermaid") }}
            />
          </pre>
          {state.status === "invalid" && <div className="mermaid-invalid-note">{t("chat.mermaid-invalid")}</div>}
        </>
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        {state.status === "ready" ? (
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
            <DialogTitle className="tw:sr-only">{t("chat.mermaid-fullscreen-title")}</DialogTitle>
            <div className="mermaid-fullscreen-toolbar">
              <span className="codeblock-lang">mermaid</span>
              <DialogClose
                className="mermaid-fullscreen-close"
                aria-label={t("chat.mermaid-close-fullscreen")}
              >
                <XIcon aria-hidden="true" />
                <span className="tw:sr-only">{t("chat.mermaid-close-fullscreen")}</span>
              </DialogClose>
            </div>
            <div
              className="mermaid-fullscreen-canvas"
              dangerouslySetInnerHTML={{ __html: state.svg }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
