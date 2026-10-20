import { getResolvedLanguage, t } from "../lib/i18n";

/** « modifié 18:39 » aujourd'hui, « hier », sinon « 12 oct. ». */
export function shortDate(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const locale = getResolvedLanguage() === "fr" ? "fr-CA" : "en-CA";
  if (diff === 0) return t("docs.modified", { time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) });
  if (diff === 1) return t("docs.yesterday");
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
