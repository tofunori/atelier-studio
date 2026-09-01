// Registre des sections de réglages (lot 1). Source UNIQUE : la nav colonne,
// le select compact ≤880px et le routage le consomment. Ajouter une section
// = une ligne ici + un fichier dans sections/.
import type { I18nKey } from "../../lib/i18n";

export type SectionId = "general" | "modeles" | "apparence" | "atelier" | "consignes";

export const SECTIONS: readonly { id: SectionId; labelKey: I18nKey }[] = [
  { id: "general", labelKey: "settings.general" },
  { id: "modeles", labelKey: "settings.models" },
  { id: "apparence", labelKey: "settings.appearance" },
  { id: "atelier", labelKey: "settings.atelier" },
  { id: "consignes", labelKey: "settings.consignes" },
];

/** Les anciennes sections (setup, providers, review, appsnap, avance) sont
 *  encore citées par des deep-links : elles retombent sur la section qui a
 *  hérité de leur contenu, pas sur « general » par défaut — setup/providers
 *  ont fusionné dans « modeles », review/appsnap dans « atelier », avance
 *  dans « general ». Garde runtime volontairement large — les deep-links
 *  (App.tsx) ne garantissent pas `string | undefined` à l'exécution :
 *  `null`, la chaîne vide ou un type inattendu retombent sur « general »
 *  sans lever. */
const LEGACY_REDIRECTS: Record<string, SectionId> = {
  setup: "modeles",
  providers: "modeles",
  review: "atelier",
  appsnap: "atelier",
  avance: "general",
};

export function resolveSection(raw: string | undefined): SectionId {
  if (typeof raw !== "string" || raw === "") return "general";
  const found = SECTIONS.find((s) => s.id === raw);
  if (found) return found.id;
  return LEGACY_REDIRECTS[raw] ?? "general";
}
