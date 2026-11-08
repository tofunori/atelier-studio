// Contexte vivant (2026-11-08) : ce que l'utilisateur regarde dans l'atelier
// au moment d'envoyer — fichier au premier plan, lignes sélectionnées ou
// curseur, page du PDF, commentaires ouverts. Publié par les éditeurs de la
// galerie (`atelier-live-context`), validé ici, montré dans le composer et
// envoyé avec le message (`liveContext`) ; le serveur en garde une trace sur
// la bulle (`LiveContextTrace`, sans le texte).
import { t } from "./i18n";

export type LiveContextComment = { line?: number; quote?: string; text: string };

export type LiveContext = {
  /** chemin absolu */
  path: string;
  name: string;
  kind: "tex" | "code" | "pdf";
  line?: number;
  lineFrom?: number;
  lineTo?: number;
  selection?: string;
  page?: number;
  pageCount?: number;
  comments?: LiveContextComment[];
};

/** Trace archivée sur la bulle user (rédigée par le serveur, miroir de
 *  `live_context::trace` côté Rust) : `comments` y est un compte. */
export type LiveContextTrace = {
  path: string;
  name: string;
  lineFrom?: number;
  lineTo?: number;
  line?: number;
  page?: number;
  comments?: number;
};

export const LIVE_CONTEXT_SELECTION_MAX = 12_000;
export const LIVE_CONTEXT_COMMENTS_MAX = 10;
/** Événement fenêtre AtelierPane → App : contexte de l'onglet focalisé. */
export const LIVE_CONTEXT_EVENT = "workspace-live-context";

const KINDS = new Set(["tex", "code", "pdf"]);

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
}

/** Valide un contexte reçu d'une iframe : tout champ hors contrat tombe. */
export function parseLiveContext(raw: unknown): LiveContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const path = typeof r.path === "string" ? r.path.trim() : "";
  // Les éditeurs envoient un chemin absolu ; le lecteur PDF peut envoyer une
  // route relative (article Zotero, base de connaissances) : on la garde.
  if (!path || /[\u0000-\u001f]/.test(path) || !KINDS.has(r.kind as string)) return null;
  if (!path.startsWith("/") && r.kind !== "pdf") return null;
  const name = text(r.name, 300) ?? path.split("/").pop() ?? path;
  const ctx: LiveContext = { path, name, kind: r.kind as LiveContext["kind"] };
  const line = positive(r.line);
  const lineFrom = positive(r.lineFrom);
  const lineTo = positive(r.lineTo);
  const page = positive(r.page);
  const pageCount = positive(r.pageCount);
  const selection = text(r.selection, LIVE_CONTEXT_SELECTION_MAX);
  if (line) ctx.line = line;
  if (lineFrom) {
    const to = lineTo ?? lineFrom;
    ctx.lineFrom = Math.min(lineFrom, to);
    ctx.lineTo = Math.max(lineFrom, to);
  }
  if (selection) ctx.selection = selection;
  if (page) ctx.page = page;
  if (pageCount) ctx.pageCount = pageCount;
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

/** Identité d'un contexte (fichier + position) : un retrait vaut pour elle
 *  seule ; une autre sélection ou un autre onglet ramène l'étiquette. */
export function liveContextKey(ctx: LiveContext): string {
  return [ctx.path, ctx.lineFrom ?? "", ctx.lineTo ?? "", ctx.line ?? "", ctx.page ?? ""].join("\u0000");
}

/** Trace posée sur la bulle optimiste (le serveur renvoie la même). */
export function liveContextTrace(ctx: LiveContext): LiveContextTrace {
  return {
    path: ctx.path,
    name: ctx.name,
    ...(ctx.lineFrom ? { lineFrom: ctx.lineFrom, lineTo: ctx.lineTo ?? ctx.lineFrom }
      : ctx.line ? { line: ctx.line } : {}),
    ...(ctx.page ? { page: ctx.page } : {}),
    ...(ctx.comments?.length ? { comments: ctx.comments.length } : {}),
  };
}

/** Position courte : « lignes 23-25 », « ligne 42 », « page 7 ». */
export function liveContextWhere(ctx: Pick<LiveContextTrace, "lineFrom" | "lineTo" | "line" | "page">): string {
  if (ctx.lineFrom) {
    const to = ctx.lineTo ?? ctx.lineFrom;
    return to !== ctx.lineFrom
      ? t("live-context.lines", { from: ctx.lineFrom, to })
      : t("live-context.line", { line: ctx.lineFrom });
  }
  if (ctx.line) return t("live-context.line", { line: ctx.line });
  if (ctx.page) return t("live-context.page", { page: ctx.page });
  return "";
}

/** Phrase du popover : « lignes 23 à 25 sélectionnées », « curseur à la
 *  ligne 42 », « page 7 sur 14 ». */
export function liveContextSentence(ctx: LiveContext): string {
  if (ctx.lineFrom) {
    const to = ctx.lineTo ?? ctx.lineFrom;
    return to !== ctx.lineFrom
      ? t("live-context.lines-selected", { from: ctx.lineFrom, to })
      : t("live-context.line-selected", { line: ctx.lineFrom });
  }
  if (ctx.line) return t("live-context.cursor", { line: ctx.line });
  if (ctx.page) {
    return ctx.pageCount
      ? t("live-context.page-of", { page: ctx.page, total: ctx.pageCount })
      : t("live-context.page", { page: ctx.page });
  }
  return "";
}

/** Chemin montré : relatif au projet quand le fichier est dedans. */
export function liveContextDisplayPath(path: string, projectRoot?: string | null): string {
  const root = (projectRoot ?? "").replace(/\/+$/, "");
  if (root && path.startsWith(`${root}/`) && path.length > root.length + 1) return path.slice(root.length + 1);
  return path;
}
