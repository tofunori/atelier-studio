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
import { IconButton, RowButton } from "../ui";
import { PassageCard } from "./PassageCard";

hljs.registerLanguage("julia", julia);
hljs.registerLanguage("latex", latex);

export const FILE_REF = /^[\w~./-]*[\w-]\.(tex|py|jl|md|r|bib|json|toml|yaml|yml|sh|js|ts|tsx|jsx|css|html|txt|csv|sql|rs|mjs|ipynb|png|pdf|svg)(:\d+(?:-\d+)?)?$/i;

export type OpenFileRefOptions = {
  diff?: boolean;
  baseSha?: string | null;
};

export function openFileRef(ref: string, options: OpenFileRefOptions = {}) {
  const m = /^(.+?)(?::(\d+(?:-\d+)?))?$/.exec(ref.trim());
  if (!m) return;
  window.dispatchEvent(new CustomEvent("chat-open-file", {
    detail: {
      rel: m[1],
      line: m[2] ?? null,
      diff: options.diff === true,
      baseSha: options.baseSha ?? null,
    },
  }));
}

export type ZoteroPassageRef = {
  kind: "zotero";
  key: string;
  pdfKey: string;
  pdfFile: string;
  page: number;
  quote: string;
};

export function parseZoteroPassageRef(href: string): ZoteroPassageRef | null {
  const prefix = "#atelier-zotero-passage?";
  if (!href.startsWith(prefix)) return null;
  const params = new URLSearchParams(href.slice(prefix.length));
  const key = params.get("key") ?? "";
  const pdfKey = params.get("pdfKey") ?? "";
  const pdfFile = params.get("file") ?? "";
  const page = Number(params.get("page"));
  const quote = (params.get("quote") ?? "").slice(0, 900);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(key) || !/^[A-Za-z0-9_-]{1,80}$/.test(pdfKey)) return null;
  if (!pdfFile || pdfFile.length > 255 || /[/\\]/.test(pdfFile) || !pdfFile.toLowerCase().endsWith(".pdf")) return null;
  if (!Number.isInteger(page) || page < 1 || page > 100_000 || !quote.trim()) return null;
  return { kind: "zotero", key, pdfKey, pdfFile, page, quote };
}

export function openZoteroPassage(ref: ZoteroPassageRef) {
  window.dispatchEvent(new CustomEvent("chat-open-zotero-passage", { detail: ref }));
}

// Deuxième source de cartes passage (tâche 6, plan Preuves) : une page du
// dépôt gbrain (corpus NAS) au lieu d'un PDF Zotero — pas de page ni de
// fichier, juste un slug de page et une citation exacte. `key` et `page`
// n'ont pas d'équivalent gbrain : la carte s'ouvre dans le SourceReader
// (surface Connaissances), défilé et surligné sur la citation, plutôt que
// dans un PDF.
export type GbrainPassageRef = {
  kind: "gbrain";
  slug: string;
  quote: string;
};

export type PassageRef = ZoteroPassageRef | GbrainPassageRef;

const GBRAIN_SLUG_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Slug de page gbrain, TEL QU'IL EXISTE réellement dans le dépôt : hiérarchique
 * (`papers/acp-19-1393-2019`) et parfois riche en points (`articles/bair-e.-h.-
 * stillinger`) — pas le simple identifiant plat d'une clé Zotero. Segments
 * `[A-Za-z0-9._-]+` séparés par `/`, sans slash de tête ni de queue, aucun
 * segment vide, aucun segment `.`/`..` (garde anti-traversée — ce store
 * n'ouvre jamais un chemin, mais un backend Rust identique valide le même
 * champ, cf. ws_router::handle_pin_passage), longueur totale ≤ 200. */
function isValidGbrainSlug(slug: string): boolean {
  if (!slug || slug.length > 200) return false;
  if (slug.startsWith("/") || slug.endsWith("/")) return false;
  return slug.split("/").every((seg) => seg !== "." && seg !== ".." && GBRAIN_SLUG_SEGMENT.test(seg));
}

export function parseGbrainPassageRef(href: string): GbrainPassageRef | null {
  const prefix = "#atelier-gbrain-passage?";
  if (!href.startsWith(prefix)) return null;
  const params = new URLSearchParams(href.slice(prefix.length));
  const slug = params.get("slug") ?? "";
  const quote = (params.get("quote") ?? "").slice(0, 900);
  if (!isValidGbrainSlug(slug)) return null;
  if (!quote.trim()) return null;
  return { kind: "gbrain", slug, quote };
}

/** Bascule sur la surface Connaissances et ouvre le SourceReader défilé/surligné
 * sur cette citation — écouté à la fois par App.tsx (bascule de surface) et
 * KbSurface.tsx (ouverture du lecteur), même schéma que
 * chat-open-zotero-passage / BiblioSurface. */
export function openGbrainPassage(ref: GbrainPassageRef) {
  window.dispatchEvent(new CustomEvent("kb-open-gbrain-passage", {
    detail: { slug: ref.slug, quote: ref.quote },
  }));
}

/** « williamson-2021-fire-aerosol » → « Williamson 2021 Fire Aerosol » —
 * libellé source d'une carte gbrain (pas de citeLabel/page comme Zotero). */
export function humanizeGbrainSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Carte passage (tâche 5) : un paragraphe dont l'UNIQUE enfant significatif
// est un lien passage se rend en carte repliable plutôt qu'en <p> + pilule
// inline. `children` ici sont les descripteurs React NON ENCORE rendus que
// react-markdown passe au composant `p` (react/jsx-runtime crée l'élément
// mais n'appelle `a()` que plus tard, pendant le rendu de `p`) : `.props.href`
// porte donc encore le href original du lien, avant toute transformation par
// MD_COMPONENTS.a. Espaces (texte blanc) tolérés autour du lien.
export function lonePassageRef(children: any): PassageRef | null {
  const list = Array.isArray(children) ? children : [children];
  const meaningful = list.filter((child) => {
    if (child == null || child === false) return false;
    if (typeof child === "string" || typeof child === "number") return String(child).trim() !== "";
    return true;
  });
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (typeof only !== "object" || !only.props) return null;
  const href = only.props.href;
  if (typeof href !== "string") return null;
  return parseZoteroPassageRef(href) ?? parseGbrainPassageRef(href);
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

/** Langage explicitement résolu par hljs — pour éviter highlightAuto (le seul
 * chemin réellement coûteux) sur du code encore en cours de streaming. */
export function hasRegisteredLanguage(lang: string): boolean {
  const normalized = LANG_ALIAS[lang.toLowerCase()] ?? lang.toLowerCase();
  return Boolean(normalized && hljs.getLanguage(normalized));
}

// chrome commun (barre, langue, bouton copie) partagé par la variante colorée
// et la variante streaming — seule la politique de coloration diffère :
// allowAuto=false colore quand même les langages explicites (```python…),
// il n'exclut que la détection automatique sur les blocs sans langue.
export function renderCodeBlock(props: any, allowAuto: boolean) {
  const [copied, setCopied] = useState(false);
  const child = props.children?.props ?? {};
  const lang = /language-([\w-]+)/.exec(String(child.className ?? ""))?.[1] ?? "";
  const raw = mdText(child.children);
  const label = lang || "text";
  const languageClass = label.replace(/[^\w-]/g, "");
  const highlighted = allowAuto || hasRegisteredLanguage(lang)
    ? highlightCode(raw, lang)
    : escapeHtml(raw);
  return (
    <div className="codeblock not-typeset">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{label}</span>
        <IconButton
          className={`codeblock-copy${copied ? " copied" : ""}`}
          label={copied ? t("chat.output-copied") : t("chat.output-copy")}
          title={copied ? t("chat.output-copied") : t("chat.output-copy")}
          onClick={() => {
            void navigator.clipboard.writeText(raw).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <CopyIcon size={12} />
        </IconButton>
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

// variante streaming : même chrome, coloration dès le stream quand la fence
// porte un langage connu (le cas de loin le plus courant) — plus de « flash »
// gris→couleur en fin de tour. Seul highlightAuto reste réservé au rendu final.
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
  p: (props: any) => {
    const ref = lonePassageRef(props.children);
    return ref ? <PassageCard refData={ref} /> : <p>{props.children}</p>;
  },
  a: (props: any) => {
    const label = mdText(props.children);
    const href = String(props.href ?? "");
    // Citation de la base de connaissances (plan 052) : pilule discrète avec
    // le titre réel — clic → surface Connaissances.
    if (href.startsWith("#atelier-kb-src?")) {
      const citeParams = new URLSearchParams(href.slice("#atelier-kb-src?".length));
      return (
        <RowButton
          className="kb-cite"
          title={label}
          onClick={() => window.dispatchEvent(new CustomEvent("kb-cite-open", {
            detail: { id: citeParams.get("id"), loc: citeParams.get("loc") },
          }))}
        >
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
          </svg>
          {label}
        </RowButton>
      );
    }
    const passage = parseZoteroPassageRef(href);
    if (passage)
      return (
        <RowButton className="file-ref zotero-passage-ref" onClick={() => openZoteroPassage(passage)} title={`Ouvrir le PDF à la page ${passage.page}`}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 1.8h7l3 3v9.4H3z" /><path d="M10 1.8v3h3M5.2 8h5.6M5.2 10.5h4" />
          </svg>
          {label}
        </RowButton>
      );
    const gbrainPassage = parseGbrainPassageRef(href);
    if (gbrainPassage)
      return (
        <RowButton className="file-ref gbrain-passage-ref" onClick={() => openGbrainPassage(gbrainPassage)} title={t("passage.open-gbrain")}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="4" r="1.5" /><circle cx="8" cy="12" r="1.5" />
            <path d="M5.3 5.1L7 10.6M10.7 5.1L9 10.6M5.5 4h5" />
          </svg>
          {label}
        </RowButton>
      );
    const ref = FILE_REF.test(label) ? label : FILE_REF.test(href) ? href : null;
    if (ref)
      return (
        <RowButton className="file-ref" onClick={() => openFileRef(ref)} title={t("action.open-file", { ref })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {label}
        </RowButton>
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
        <RowButton className="file-ref" onClick={() => openFileRef(txt)} title={t("action.open-file", { ref: txt })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {txt}
        </RowButton>
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
