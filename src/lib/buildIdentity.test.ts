import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import { UNKNOWN_COMMIT, versionWithBuild } from "./buildIdentity";
import { UNKNOWN_COMMIT as SCRIPT_UNKNOWN_COMMIT } from "../../scripts/build-identity.mts";

afterEach(() => setLanguage("fr"));

describe("identité de build affichée", () => {
  it("ajoute le commit et la date à la version, qui reste 2.0.0 sur toutes les builds", () => {
    setLanguage("fr");
    expect(versionWithBuild("2.0.0", { commit: "9bcdc0e", date: "2026-10-18 22:48" }))
      .toBe("2.0.0 · build 9bcdc0e du 2026-10-18 22:48");
    setLanguage("en");
    expect(versionWithBuild("2.0.0", { commit: "9bcdc0e", date: "2026-10-18 22:48" }))
      .toBe("2.0.0 · build 9bcdc0e, 2026-10-18 22:48");
  });

  it("dit « inconnu » quand git manquait au build", () => {
    setLanguage("fr");
    expect(versionWithBuild("2.0.0", { commit: UNKNOWN_COMMIT, date: "2026-10-18 22:48" }))
      .toBe("2.0.0 · build inconnu du 2026-10-18 22:48");
    setLanguage("en");
    expect(versionWithBuild("2.0.0", { commit: UNKNOWN_COMMIT, date: "" }))
      .toBe("2.0.0 · build unknown, unknown");
  });

  it("garde la version seule hors d'une build Vite (identité absente)", () => {
    expect(versionWithBuild("2.0.0", null)).toBe("2.0.0");
  });

  it("partage la valeur « inconnu » avec le script de build", () => {
    expect(UNKNOWN_COMMIT).toBe(SCRIPT_UNKNOWN_COMMIT);
  });
});
