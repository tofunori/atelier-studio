// Contexte vivant (2026-11-08) : ce que l'utilisateur regarde dans l'atelier
// au moment d'envoyer — fichier au premier plan, ligne du curseur, page du
// PDF, commentaires ouverts. Jamais la sélection : un passage ne va au chat
// que par « Ajouter au chat » (Thierry, 2026-11-08). Publié par les éditeurs de la
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
  page?: number;
  pageCount?: number;
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
  comments?: number;
};

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

/** Valide un contexte reçu d'une iframe : tout champ hors contrat tombe,
 *  sélection comprise (lignes sélectionnées et texte). */
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
  const page = positive(r.page);
  const pageCount = positive(r.pageCount);
  if (line) ctx.line = line;
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

/** Phrase du popover : « curseur à la ligne 42 », « page 7 sur 14 ». */
export function liveContextSentence(ctx: LiveContext): string {
  if (ctx.line) return t("live-context.cursor", { line: ctx.line });
  if (ctx.page) {
    return ctx.pageCount
      ? t("live-context.page-of", { page: ctx.page, total: ctx.pageCount })
      : t("live-context.page", { page: ctx.page });
  }
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
