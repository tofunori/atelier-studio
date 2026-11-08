// Lignes grises des cartes de l'écran d'ouverture (échéance, activité).
// Hors de l'entrée : seul l'écran, chargé à la demande, les importe.
import { t, getResolvedLanguage } from "./i18n";
import type { ProjectDue } from "./projectsHome";

const DAY = 86_400_000;

function shortDate(at: Date, now: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (at.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return at.toLocaleDateString(getResolvedLanguage() === "en" ? "en" : "fr-CA", opts);
}

/** « il y a 2 h », « hier », « 12 nov. » — null quand on ne sait rien. */
export function activityText(at: number, now: Date): string | null {
  if (!at) return null;
  const ms = now.getTime() - at;
  if (ms < 60_000) return t("home.rel.now");
  if (ms < 3_600_000) return t("home.rel.min", { n: Math.floor(ms / 60_000) });
  if (ms < DAY) return t("home.rel.hours", { n: Math.floor(ms / 3_600_000) });
  if (ms < 2 * DAY) return t("projects.yesterday");
  if (ms < 7 * DAY) return t("home.rel.days", { n: Math.floor(ms / DAY) });
  return shortDate(new Date(at), now);
}

/** Jours calendaires entre aujourd'hui et la date (AAAA-MM-JJ), en heure locale. */
function daysUntil(date: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY);
}

/** « Soumission dans 23 jours », « Échéance aujourd'hui », « Cours le 12 déc. ». */
export function dueText(due: ProjectDue | undefined, now: Date): string | null {
  if (!due?.date) return null;
  const days = daysUntil(due.date, now);
  if (days == null) return null;
  const label = due.label?.trim() || t("projects.due");
  const [y, mo, d] = due.date.split("-").map(Number);
  const date = shortDate(new Date(y, mo - 1, d), now);
  if (days < 0) return t("projects.due-past", { label, date });
  if (days === 0) return t("projects.due-today", { label });
  if (days === 1) return t("projects.due-tomorrow", { label });
  if (days <= 60) return t("projects.due-in", { label, n: days });
  return t("projects.due-on", { label, date });
}

