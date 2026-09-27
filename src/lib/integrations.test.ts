// Store des intégrations distantes : ce qui est actif tant que le serveur n'a
// rien dit (rien), comment un message mal formé retombe (sur « désactivé »,
// jamais sur un hôte deviné), et les chemins/commandes dérivés.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./wsBus", () => ({ wsSend: vi.fn(() => true) }));

import {
  DEFAULT_ZOTERO_DIR, DISABLED_INTEGRATIONS, clusterSshCommand, integrationsSnapshot,
  normalizeEffective, ragdocEnabled, requestIntegrations, resetIntegrationsForTests,
  saveIntegrations, subscribeIntegrations, zoteroDataDir, zoteroStoragePath,
} from "./integrations";
import { relaySidecarMessage } from "./sidecarRelays";
import { wsSend } from "./wsBus";

afterEach(() => {
  resetIntegrationsForTests();
  vi.clearAllMocks();
});

const EFFECTIVE = {
  ragdoc: true,
  gbrain: "ssh",
  nasHost: "nas",
  clusters: { narval: { host: "narval-vpn", gateway: "nas" }, rorqual: null },
  crossref: true,
  zoteroDir: "/Volumes/Data/Zotero",
  zoteroFound: true,
  zoteroSource: "config",
};

describe("intégrations — état initial", () => {
  it("tout est désactivé avant le premier message, Zotero retombe sur ~/Zotero", () => {
    const s = integrationsSnapshot();
    expect(s.loaded).toBe(false);
    expect(s.effective).toEqual(DISABLED_INTEGRATIONS);
    expect(ragdocEnabled()).toBe(false);
    expect(zoteroDataDir()).toBe("~/Zotero");
  });
});

describe("intégrations — message du serveur", () => {
  it("le relais WS alimente le store et prévient les abonnés", () => {
    const listener = vi.fn();
    const off = subscribeIntegrations(listener);
    const config = { ragdoc: { host: "nas", root: "/srv/ragdoc" } };
    expect(relaySidecarMessage({ type: "integrations", config, effective: EFFECTIVE })).toBe(true);
    off();
    expect(listener).toHaveBeenCalled();
    const s = integrationsSnapshot();
    expect(s.loaded).toBe(true);
    expect(s.config).toEqual(config);
    expect(s.error).toBeNull();
    expect(s.effective.clusters.narval).toEqual({ host: "narval-vpn", gateway: "nas" });
    expect(ragdocEnabled()).toBe(true);
    expect(zoteroDataDir()).toBe("/Volumes/Data/Zotero");
  });

  it("un refus garde l'ancienne config et expose l'erreur", () => {
    relaySidecarMessage({ type: "integrations", config: {}, effective: EFFECTIVE, error: "hôte invalide" });
    expect(integrationsSnapshot().error).toBe("hôte invalide");
    relaySidecarMessage({ type: "integrations", config: {}, effective: EFFECTIVE, error: "  " });
    expect(integrationsSnapshot().error).toBeNull();
  });

  it("un champ absent ou mal typé retombe sur « désactivé »", () => {
    expect(normalizeEffective(undefined)).toEqual(DISABLED_INTEGRATIONS);
    const e = normalizeEffective({
      ragdoc: "yes", gbrain: "cloud", nasHost: "  ", crossref: 1,
      clusters: { narval: { host: "" }, rorqual: { host: " rorqual ", gateway: "" } },
      zoteroDir: "", zoteroFound: "true", zoteroSource: "registry",
    });
    expect(e).toEqual({
      ...DISABLED_INTEGRATIONS,
      clusters: { narval: null, rorqual: { host: "rorqual", gateway: null } },
    });
  });

  it("gbrain local est distinct de gbrain désactivé", () => {
    expect(normalizeEffective({ gbrain: "local" }).gbrain).toBe("local");
    expect(normalizeEffective({ gbrain: null }).gbrain).toBeNull();
  });
});

describe("intégrations — messages envoyés", () => {
  it("lire et enregistrer passent par le bus WS, sous les noms du contrat", () => {
    requestIntegrations();
    const config = { gbrain: { sshHost: "" }, crossrefMailto: "a@b.c" };
    saveIntegrations(config);
    expect(vi.mocked(wsSend).mock.calls).toEqual([
      [{ type: "integrations" }],
      [{ type: "saveIntegrations", config }],
    ]);
  });
});

describe("intégrations — dérivés purs", () => {
  it("chemin Zotero : dossier donné, barre finale retirée, repli sur ~/Zotero", () => {
    expect(zoteroStoragePath("/Volumes/Data/Zotero/", "ABCD1234", "a.pdf")).toBe("/Volumes/Data/Zotero/storage/ABCD1234/a.pdf");
    expect(zoteroStoragePath("", "K", "b.pdf")).toBe(`${DEFAULT_ZOTERO_DIR}/storage/K/b.pdf`);
  });

  it("commande SSH d'une grappe : via la passerelle si elle existe", () => {
    expect(clusterSshCommand({ host: "narval-vpn", gateway: "nas" })).toBe("ssh nas -t ssh narval-vpn");
    expect(clusterSshCommand({ host: "rorqual", gateway: null })).toBe("ssh rorqual");
  });
});
