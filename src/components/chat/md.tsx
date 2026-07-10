// Pipeline markdown du chat (plan 015, slice 4) — déplacé verbatim depuis
// Chat.tsx : liens fichier:ligne, coloration hljs, blocs code (streaming ou
// non), Mermaid, KaTeX. Aucune logique modifiée.
import { useEffect, useState } from "react";
import hljs from "highlight.js/lib/common";
import julia from "highlight.js/lib/languages/julia";
import latex from "highlight.js/lib/languages/latex";
import remarkGfm from "remark-gfm";
import { t } from "../../lib/i18n";
import { LruCache } from "../../lib/lruCache";
import { MermaidBlock } from "../MermaidBlock";
import { CopyIcon } from "../icons";
import { openUrl } from "@tauri-apps/plugin-opener";

hljs.registerLanguage("julia", julia);
hljs.registerLanguage("latex", latex);

export const FILE_REF = /^[\w~./-]*[\w-]\.(tex|py|jl|md|r|R|bib|json|toml|yaml|yml|sh|js|ts|tsx|jsx|css|html|txt|csv|sql|rs|mjs|ipynb)(:\d+(?:-\d+)?)?$/;

export function openFileRef(ref: string) {
  const m = /^(.+?)(?::(\d+(?:-\d+)?))?$/.exec(ref.trim());
  if (!m) return;
  window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel: m[1], line: m[2] ?? null } }));
}

// texte complet des enfants markdown (string, tableau, éléments imbriqués)
export function mdText(children: any): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(mdText).join("");
  if (typeof children === "object" && children.props) return mdText(children.props.children);
  return "";
}

export const LANG_ALIAS: Record<string, string> = {
  bib: "latex",
  cjs: "javascript",
  console: "bash",
  jl: "julia",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  sty: "latex",
  tex: "latex",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  zsh: "bash",
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// cache module-level borné (~300 entrées, éviction LRU) : chaque event ajouté
// re-rend toute la liste des messages, donc sans cache tous les blocs de code
// de l'historique seraient recolorés à chaque token reçu (O(n²) sur les
// longues réponses). Clé = `${lang} ${raw}`.
const highlightCache = new LruCache<string>(300);

export function highlightCode(raw: string, lang: string): string {
  const key = `${lang} ${raw}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;

  const normalized = LANG_ALIAS[lang.toLowerCase()] ?? lang.toLowerCase();
  let result: string;
  try {
    if (normalized && hljs.getLanguage(normalized)) {
      result = hljs.highlight(raw, { language: normalized, ignoreIllegals: true }).value;
    } else {
      result = hljs.highlightAuto(raw).value;
    }
  } catch {
    result = escapeHtml(raw);
  }
  highlightCache.set(key, result);
  return result;
}

// chrome commun (barre, langue, bouton copie) partagé par la variante colorée
// et la variante streaming — seule la coloration (highlight vs texte brut)
// diffère entre les deux.
export function renderCodeBlock(props: any, highlight: boolean) {
  const [copied, setCopied] = useState(false);
  const child = props.children?.props ?? {};
  const lang = /language-([\w-]+)/.exec(String(child.className ?? ""))?.[1] ?? "";
  const raw = mdText(child.children);
  const label = lang || "text";
  const languageClass = label.replace(/[^\w-]/g, "");
  const highlighted = highlight ? highlightCode(raw, lang) : escapeHtml(raw);
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{label}</span>
        <button
          type="button"
          className={`codeblock-copy${copied ? " copied" : ""}`}
          title={copied ? t("chat.output-copied") : t("chat.output-copy")}
          aria-label={copied ? t("chat.output-copied") : t("chat.output-copy")}
          onClick={() => {
            void navigator.clipboard.writeText(raw).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <CopyIcon size={12} />
        </button>
      </div>
      <pre>
        <code
          className={`hljs language-${languageClass}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

export function MarkdownCodeBlock(props: any) {
  return renderCodeBlock(props, true);
}

// variante streaming : même chrome, sans coloration — évite highlightAuto (le
// plus coûteux) sur du code encore incomplet à chaque token reçu.
export function MarkdownCodeBlockStreaming(props: any) {
  return renderCodeBlock(props, false);
}

export function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  return "";
}

export function PreBlock(props: any) {
  const child = props.children?.props ?? {};
  const lang = /language-([\w-]+)/.exec(String(child.className ?? ""))?.[1] ?? "";
  if (lang === "mermaid") {
    return <MermaidBlock source={mdText(child.children)} highlight={highlightCode} />;
  }
  return <MarkdownCodeBlock {...props} />;
}

// composants markdown : liens externes stylés + réfs fichier:ligne cliquables
export const MD_COMPONENTS = {
  pre: PreBlock,
  table: (props: any) => (
    <div className="md-table"><table>{props.children}</table></div>
  ),
  a: (props: any) => {
    const label = mdText(props.children);
    const href = String(props.href ?? "");
    const ref = FILE_REF.test(label) ? label : FILE_REF.test(href) ? href : null;
    if (ref)
      return (
        <button className="file-ref" onClick={() => openFileRef(ref)} title={t("action.open-file", { ref })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {label}
        </button>
      );
    return (
      <a
        className="md-link"
        href={href}
        onClick={(e) => { e.preventDefault(); if (/^https?:/.test(href)) openUrl(href); }}
      >
        {props.children}
      </a>
    );
  },
  code: (props: any) => {
    const txt = mdText(props.children);
    if (!props.className && FILE_REF.test(txt))
      return (
        <button className="file-ref" onClick={() => openFileRef(txt)} title={t("action.open-file", { ref: txt })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {txt}
        </button>
      );
    return <code className={props.className}>{props.children}</code>;
  },
};

// bulle en streaming : mêmes composants, sauf le code coloré (perf, cf.
// MarkdownCodeBlockStreaming ci-dessus).
export const MD_COMPONENTS_STREAMING = { ...MD_COMPONENTS, pre: MarkdownCodeBlockStreaming };

// ---- maths HORS du chemin critique (plan 022) -----------------------------
// KaTeX + remark-math (273 KB min / 82 KB gzip) se chargent à l'IDLE du boot,
// jamais dans l'entrée. Avant chargement, $x^2$ s'affiche en texte brut puis
// s'upgrade au chargement — aucun contenu perdu, aucun blocage du premier
// rendu. remark-math : singleDollarTextMath au défaut (usage scientifique).
// throwOnError:false — un LaTeX invalide ne fait jamais planter le rendu.
type MdPlugins = { remark: any[]; rehype: any[] };
let mathPlugins: MdPlugins | null = null;
const mathListeners = new Set<() => void>();

function loadMath() {
  if (mathPlugins) return;
  Promise.all([
    import("remark-math"),
    import("rehype-katex"),
    import("katex/dist/katex.min.css"),
  ]).then(([rm, rk]) => {
    mathPlugins = {
      remark: [remarkGfm, rm.default],
      rehype: [[rk.default, { throwOnError: false }]],
    };
    mathListeners.forEach((cb) => cb());
    mathListeners.clear();
  }).catch(() => { /* offline : le markdown reste fonctionnel sans maths */ });
}
if (typeof requestIdleCallback === "function") requestIdleCallback(() => loadMath());
else setTimeout(loadMath, 400);

const BASE_PLUGINS: MdPlugins = { remark: [remarkGfm], rehype: [] };

/** Plugins markdown courants — se mettent à jour une fois KaTeX chargé. */
export function useMdPlugins(): MdPlugins {
  const [plugins, setPlugins] = useState<MdPlugins>(mathPlugins ?? BASE_PLUGINS);
  useEffect(() => {
    if (mathPlugins) { setPlugins(mathPlugins); return; }
    const cb = () => setPlugins(mathPlugins!);
    mathListeners.add(cb);
    return () => { mathListeners.delete(cb); };
  }, []);
  return plugins;
}

// compat : consommateurs non-composants (valeur au boot, sans maths)
export const MD_REMARK_PLUGINS = BASE_PLUGINS.remark;
export const MD_REHYPE_PLUGINS: any[] = BASE_PLUGINS.rehype;
