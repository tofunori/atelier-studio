// Contexte vivant (2026-11-08) : ce que l'utilisateur regarde dans l'atelier
// au moment d'envoyer — fichier au premier plan, ligne du curseur, page du
// PDF, commentaires ouverts. Jamais la sélection : un passage ne va au chat
// que par « Ajouter au chat » (Thierry, 2026-11-08). Publié par les éditeurs de la
// galerie (`atelier-live-context`), validé ici, montré dans le composer et
// envoyé avec le message (`liveContext`) ; le serveur en garde une trace sur
// la bulle (`LiveContextTrace`, sans le texte).
import { t } from "./i18n";

export type LiveContextComment = { line?: number; quote?: string; text: string };

/** Sources (2026-11-09) : éditeurs LaTeX et code, lecteur PDF, puis figure
 *  (galerie ou onglet image), .docx, fiche d'article de la bibliothèque et
 *  page web du navigateur. */
export type LiveContextKind = "tex" | "code" | "pdf" | "figure" | "docx" | "article" | "web";

export type LiveContext = {
  /** chemin absolu ; route `zotero/…` pour un PDF ou un article de la
   *  bibliothèque ; l'adresse elle-même pour une page web */
  path: string;
  name: string;
  kind: LiveContextKind;
  line?: number;
  page?: number;
  pageCount?: number;
  /** paragraphe du curseur (.docx), 1-based */
  paragraph?: number;
  /** titre complet (article, page web) */
  title?: string;
  /** lien http(s) : page web, DOI d'un article */
  url?: string;
  comments?: LiveContextComment[];
};

/** Trace archivée sur la bulle user (rédigée par le serveur, miroir de
 *  `live_context::trace` côté Rust) : `comments` y est un compte.
 *  `lineFrom`/`lineTo` : messages envoyés avant 2026-11-08 (sélection). */
export type LiveContextTrace = {
  path: string;
  name: string;
  lineFrom?: number;
  lineTo?: number;
  line?: number;
  page?: number;
  paragraph?: number;
  comments?: number;
};

export const LIVE_CONTEXT_COMMENTS_MAX = 10;
/** Surfaces React (bibliothèque, navigateur) → AtelierPane : ce que la
 *  surface montre, `{surface, context}` ; AtelierPane le publie quand la
 *  surface est l'onglet actif du pane focalisé. */
export const SURFACE_LIVE_CONTEXT_EVENT = "atelier-surface-live-context";

export function publishSurfaceLiveContext(surface: string, context: LiveContext | null): void {
  window.dispatchEvent(new CustomEvent(SURFACE_LIVE_CONTEXT_EVENT, { detail: { surface, context } }));
}

const RASTER_IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic)$/i;

/** Onglet document qui affiche une image brute (aucun script ne tourne
 *  dedans) : le contexte « figure » se déduit de son adresse. */
export function imageTabLiveContext(tab: { url: string; title: string; projectRoot?: string }): LiveContext | null {
  if (!tab.projectRoot) return null;
  let rel: string;
  try { rel = decodeURIComponent(new URL(tab.url).pathname).replace(/^\/+/, ""); } catch { return null; }
  if (!rel || !RASTER_IMAGE.test(rel) || rel.startsWith(".fig_thumbs/")) return null;
  const path = `${tab.projectRoot.replace(/\/+$/, "")}/${rel}`;
  return { path, name: rel.split("/").pop() ?? tab.title, kind: "figure" };
}

/** Fiche d'article de la bibliothèque (Zotero) → contexte « article ». */
export function articleLiveContext(item: { key: string; title: string; creators: string; year: string; doi?: string }): LiveContext {
  const authors = item.creators.split(/\s*;\s*/).filter(Boolean);
  const first = (authors[0] ?? "").split(",")[0].trim();
  const name = [first ? `${first}${authors.length > 1 ? " et al." : ""}` : "", item.year].filter(Boolean).join(" ")
    || item.title.slice(0, 80) || item.key;
  const doi = item.doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return {
    path: `zotero/${item.key}`, name, kind: "article",
    ...(item.title ? { title: item.title.slice(0, 300) } : {}),
    ...(doi ? { url: `https://doi.org/${doi}` } : {}),
  };
}

/** Événement fenêtre AtelierPane → App : contexte de l'onglet focalisé. */
export const LIVE_CONTEXT_EVENT = "workspace-live-context";

const KINDS = new Set<string>(["tex", "code", "pdf", "figure", "docx", "article", "web"]);
const HTTP_URL = /^https?:\/\/[^\s]+$/i;

function httpUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 2000 && HTTP_URL.test(value.trim()) ? value.trim() : undefined;
}

/** Le chemin attendu dépend de la source : absolu pour un fichier, route
 *  `zotero/…` permise pour un PDF ou un article, adresse http(s) pour le web. */
function pathFits(kind: string, path: string): boolean {
  if (kind === "web") return HTTP_URL.test(path) && path.length <= 2000;
  if (kind === "pdf" || kind === "article") return true;
  return path.startsWith("/");
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
}

/** Valide un contexte reçu d'une iframe : tout champ hors contrat tombe,
 *  sélection comprise (lignes sélectionnées et texte). */
export function parseLiveContext(raw: unknown): LiveContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const path = typeof r.path === "string" ? r.path.trim() : "";
  if (!path || /[\u0000-\u001f]/.test(path) || !KINDS.has(r.kind as string)) return null;
  if (!pathFits(r.kind as string, path)) return null;
  const name = text(r.name, 300) ?? path.split("/").pop() ?? path;
  const ctx: LiveContext = { path, name, kind: r.kind as LiveContext["kind"] };
  const line = positive(r.line);
  const page = positive(r.page);
  const pageCount = positive(r.pageCount);
  const paragraph = positive(r.paragraph);
  const title = text(r.title, 300);
  const url = httpUrl(r.url);
  if (line) ctx.line = line;
  if (page) ctx.page = page;
  if (pageCount) ctx.pageCount = pageCount;
  if (paragraph) ctx.paragraph = paragraph;
  if (title) ctx.title = title;
  if (url) ctx.url = url;
  if (Array.isArray(r.comments)) {
    const comments = r.comments.flatMap((c): LiveContextComment[] => {
      if (!c || typeof c !== "object") return [];
      const body = text((c as Record<string, unknown>).text, 600);
      if (!body) return [];
      const quote = text((c as Record<string, unknown>).quote, 300);
      const at = positive((c as Record<string, unknown>).line);
      return [{ text: body, ...(quote ? { quote } : {}), ...(at ? { line: at } : {}) }];
    }).slice(0, LIVE_CONTEXT_COMMENTS_MAX);
    if (comments.length) ctx.comments = comments;
  }
  return ctx;
}

/** Œil du compositeur (2026-11-09, variante C) : allumé, le contexte vivant
 *  part avec chaque message ; coupé, il reste coupé d'un message à l'autre et
 *  après une relance, jusqu'au prochain clic. Allumé par défaut. */
export const LIVE_CONTEXT_ON_KEY = "atelier-studio.liveContextOn";

export function readLiveContextOn(): boolean {
  try { return localStorage.getItem(LIVE_CONTEXT_ON_KEY) !== "0"; } catch { return true; }
}

export function writeLiveContextOn(on: boolean): void {
  try { localStorage.setItem(LIVE_CONTEXT_ON_KEY, on ? "1" : "0"); } catch { /* stockage indisponible : l'état vit en mémoire */ }
}

/** Trace posée sur la bulle optimiste (le serveur renvoie la même). */
export function liveContextTrace(ctx: LiveContext): LiveContextTrace {
  return {
    path: ctx.path,
    name: ctx.name,
    ...(ctx.line ? { line: ctx.line } : {}),
    ...(ctx.page ? { page: ctx.page } : {}),
    ...(ctx.paragraph ? { paragraph: ctx.paragraph } : {}),
    ...(ctx.comments?.length ? { comments: ctx.comments.length } : {}),
  };
}

/** Position courte : « lignes 23-25 », « ligne 42 », « page 7 », « paragraphe 12 ». */
export function liveContextWhere(ctx: Pick<LiveContextTrace, "lineFrom" | "lineTo" | "line" | "page" | "paragraph">): string {
  if (ctx.lineFrom) {
    const to = ctx.lineTo ?? ctx.lineFrom;
    return to !== ctx.lineFrom
      ? t("live-context.lines", { from: ctx.lineFrom, to })
      : t("live-context.line", { line: ctx.lineFrom });
  }
  if (ctx.line) return t("live-context.line", { line: ctx.line });
  if (ctx.page) return t("live-context.page", { page: ctx.page });
  if (ctx.paragraph) return t("live-context.paragraph", { n: ctx.paragraph });
  return "";
}

/** Première ligne du panneau de l'œil : le chemin pour un fichier, l'adresse
 *  pour une page web, le titre pour un article. */
export function liveContextHeadline(ctx: LiveContext, projectRoot?: string | null): string {
  if (ctx.kind === "web") return ctx.url ?? ctx.path;
  if (ctx.kind === "article") return ctx.title ?? ctx.name;
  return liveContextDisplayPath(ctx.path, projectRoot);
}

/** Phrase du popover : « curseur à la ligne 42 », « page 7 sur 14 ». */
export function liveContextSentence(ctx: LiveContext): string {
  if (ctx.line) return t("live-context.cursor", { line: ctx.line });
  if (ctx.page) {
    return ctx.pageCount
      ? t("live-context.page-of", { page: ctx.page, total: ctx.pageCount })
      : t("live-context.page", { page: ctx.page });
  }
  if (ctx.paragraph) return t("live-context.cursor-paragraph", { n: ctx.paragraph });
  if (ctx.kind === "figure") return t("live-context.figure-note");
  if (ctx.kind === "web") return ctx.title ?? "";
  if (ctx.kind === "article") return ctx.url ?? "";
  return "";
}

/** Ce que dit le survol de l'œil du compositeur. */
export function liveContextEyeLabel(b: { context: LiveContext | null; on: boolean }): string {
  if (!b.on) return t("live-context.off");
  if (!b.context) return t("live-context.idle");
  return t("live-context.sees", { name: b.context.name, where: liveContextWhere(b.context) }).trim();
}

/** Chemin montré : relatif au projet quand le fichier est dedans. */
export function liveContextDisplayPath(path: string, projectRoot?: string | null): string {
  const root = (projectRoot ?? "").replace(/\/+$/, "");
  if (root && path.startsWith(`${root}/`) && path.length > root.length + 1) return path.slice(root.length + 1);
  return path;
}
