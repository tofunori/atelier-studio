// Rendu des diagrammes Mermaid dans les messages finaux (JAMAIS en
// streaming — voir Chat.tsx : MD_COMPONENTS_STREAMING garde le bloc de code
// en clair). Intégration par composant custom (pas rehype-mermaid, pas de
// plugin remark) : on intercepte language-mermaid dans le composant `pre`.
//
// Moteur : Pele (obsidianmd/pele, MIT), qui lit la syntaxe Mermaid et rend un
// SVG sans dépendance. Remplace mermaid.js (2026-10-18) :
// - import("pele") dynamique, promesse module-level partagée (lazy, jamais
//   dans le chunk principal — vite code-split automatiquement les import()).
// - parse() avant mount() : un diagramme invalide ou d'un type inconnu
//   retombe sur le bloc de code normal + mention sobre, jamais sur le message
//   d'erreur de Pele.
// - Contenu LLM non fiable : liens et images désactivés (une image ferait une
//   requête réseau, un lien naviguerait la webview). Pele échappe le texte et
//   ignore les callbacks `click`.
// - Theming : Pele lit ses variables CSS (--pele-*), branchées sur les tokens
//   dans App.css (.mermaid-block) : la bascule clair/sombre ne re-rend rien.
// - mount() adapte la mise en page à la largeur du conteneur (et la refait
//   au redimensionnement) au lieu de rétrécir le dessin.

import { useCallback, useEffect, useState } from "react";
import { Maximize2Icon, XIcon } from "lucide-react";
import type { MountOptions } from "pele";
import { t } from "../lib/i18n";
import { CopyIcon } from "./icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./shadcn/dialog";
import { Button, IconButton } from "./ui";

type PeleModule = typeof import("pele");

// Promesse module-level partagée : un seul import("pele") pour toute la
// session, même si plusieurs diagrammes sont rencontrés en parallèle.
let peleModulePromise: Promise<PeleModule> | null = null;
function loadPele(): Promise<PeleModule> {
  if (!peleModulePromise) peleModulePromise = import("pele");
  return peleModulePromise;
}

/** Options communes : taille de texte du système (13 px), rien qui sorte du SVG. */
export const PELE_OPTIONS = { fontSize: 13, links: false, images: false } as const satisfies MountOptions;

type RenderState = { status: "loading" } | { status: "ready"; pele: PeleModule } | { status: "invalid" };

/** Valide le source sans le dessiner : invalide ou type inconnu → bloc de code. */
async function prepareDiagram(source: string): Promise<RenderState> {
  try {
    const pele = await loadPele();
    pele.parse(source);
    return { status: "ready", pele };
  } catch {
    return { status: "invalid" };
  }
}

/**
 * Ref de rappel qui monte le diagramme dans l'élément et le démonte avec lui
 * (React 19 : la ref renvoie son nettoyage). Stable tant que pele/source/zoom
 * ne changent pas, donc les re-rendus de la liste ne remontent rien.
 */
function usePeleMount(
  pele: PeleModule | null,
  source: string,
  zoom: MountOptions["zoom"],
  onInvalid: () => void,
) {
  return useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !pele) return;
      let mounted: ReturnType<PeleModule["mount"]> | null = null;
      try {
        mounted = pele.mount(el, source, { ...PELE_OPTIONS, zoom, onError: onInvalid });
      } catch {
        onInvalid();
      }
      return () => {
        mounted?.destroy();
        el.replaceChildren();
      };
    },
    [pele, source, zoom, onInvalid],
  );
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

  // rendu initial / re-validation si le source change (guard "toujours monté").
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    void prepareDiagram(source).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [source]);

  const markInvalid = useCallback(() => setState({ status: "invalid" }), []);
  const pele = state.status === "ready" ? state.pele : null;
  const inlineRef = usePeleMount(pele, source, false, markInvalid);
  const fullscreenRef = usePeleMount(pele, source, true, markInvalid);

  const ready = state.status === "ready";

  return (
    <div className="codeblock mermaid-block not-typeset">
      <div className="codeblock-bar">
        <span className="codeblock-lang">mermaid</span>
        <div className="codeblock-bar-actions">
          {ready && (
            <>
              <Button
                variant="ghost"
                className="mermaid-toggle"
                onClick={() => setMode((m) => (m === "diagram" ? "code" : "diagram"))}
              >
                {mode === "diagram" ? t("chat.mermaid-view-code") : t("chat.mermaid-view-diagram")}
              </Button>
              {mode === "diagram" && (
                <IconButton
                  className="codeblock-copy mermaid-expand"
                  title={t("chat.mermaid-expand")}
                  label={t("chat.mermaid-expand")}
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2Icon size={12} />
                </IconButton>
              )}
            </>
          )}
          <IconButton
            className={`codeblock-copy${copied ? " copied" : ""}`}
            title={copied ? t("chat.output-copied") : t("chat.output-copy")}
            label={copied ? t("chat.output-copied") : t("chat.output-copy")}
            onClick={() => {
              void navigator.clipboard.writeText(source).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            <CopyIcon size={12} />
          </IconButton>
        </div>
      </div>
      {mode === "diagram" && ready ? (
        <div className="mermaid-svg-wrap" ref={inlineRef} />
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
        {ready ? (
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
            <div className="mermaid-fullscreen-canvas" ref={fullscreenRef} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
