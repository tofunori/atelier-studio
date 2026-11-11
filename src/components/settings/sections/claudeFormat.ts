// Réglages › Claude : types de l'état du connecteur et mise en forme
// (chemins, heures, libellés des actions), hors du fichier du composant.
import { t, type I18nKey } from "../../../lib/i18n";

export type ClaudeActivity = { t: number; tool: string; path?: string; ok?: boolean };

export type ClaudeStatus = {
  enabled?: boolean;
  running?: boolean;
  byAtelier?: boolean;
  roots?: string[];
  url?: string | null;
  home?: string | null;
  codeSet?: boolean;
  linked?: boolean;
  client?: string | null;
  linkedSince?: number | null;
  activity?: ClaudeActivity[];
};

export type ClaudeAction = (action: string, payload?: Record<string, unknown>) => Promise<ClaudeStatus>;

/** Outils trop bavards pour le journal (une page de PDF = un appel). */
const QUIET = new Set(["render_pdf_page", "list_revisions"]);

const TIME = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
export const DATE = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric" });

export function shortPath(path: string, home?: string | null): string {
  return home && path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

export function baseName(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

/** « 18:42 » aujourd'hui, « 9 nov. · 18:42 » sinon. */
export function when(seconds: number, now = new Date()): string {
  const d = new Date(seconds * 1000);
  const time = TIME.format(d);
  return d.toDateString() === now.toDateString() ? time : `${DAY.format(d)} · ${time}`;
}

export function actionLabel(tool: string): string {
  const key = `settings.claude-act-${tool}` as I18nKey;
  const text = t(key);
  return text === key ? t("settings.claude-act-other", { tool }) : text;
}

export function errorText(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
}

/** Les actions à montrer, chacune avec une clé stable tirée de son contenu
 * (deux appels identiques dans la même seconde reçoivent #1, #2…). */
export function visibleActivity(activity: ClaudeActivity[] = [], max = 8): (ClaudeActivity & { key: string })[] {
  const seen = new Map<string, number>();
  return activity
    .filter((a) => !QUIET.has(a.tool))
    .slice(0, max)
    .map((a) => {
      const base = `${a.t}-${a.tool}-${a.path ?? ""}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { ...a, key: n > 1 ? `${base}#${n}` : base };
    });
}
