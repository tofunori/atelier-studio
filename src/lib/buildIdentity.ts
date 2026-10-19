import { t } from "./i18n";

/** Identité de la build en cours : commit court et date locale du build,
 * injectés par `vite.config.ts` (`define`, calculés par
 * `scripts/build-identity.mts`). `null` hors de cette config (tests). */
export interface BuildIdentity {
  commit: string;
  date: string;
}

/** Valeur du commit quand git manquait au build (même littéral que
 * `UNKNOWN_COMMIT` dans `scripts/build-identity.mts`). */
export const UNKNOWN_COMMIT = "inconnu";

export const BUILD_IDENTITY: BuildIdentity | null =
  typeof __ATELIER_BUILD__ === "undefined" ? null : __ATELIER_BUILD__;

/** « 2.0.0 · build 9bcdc0e du 2026-10-18 22:48 » : la version de Cargo seule
 * ne distingue aucune build (elle reste 2.0.0). */
export function versionWithBuild(version: string, build: BuildIdentity | null): string {
  if (!build) return version;
  const commit = build.commit && build.commit !== UNKNOWN_COMMIT ? build.commit : t("settings.build-unknown");
  return t("settings.build-identity", { version, commit, date: build.date || t("settings.build-unknown") });
}
