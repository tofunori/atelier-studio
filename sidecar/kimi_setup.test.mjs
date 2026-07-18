// Setup Kimi (plan 046, étape 10) — sonde SANS quota : binaire → --version →
// initialize → authenticate(login) → discovery modèles ; états distincts
// not_installed / version_unsupported / login_needed / model_config_needed /
// ready / protocol_error. Jamais de session/prompt.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  catalogFromProviderList,
  compareKimiVersions,
  deriveKimiSetupState,
  resolveKimiBin,
  setupProbe,
  shadowedOfficialInstall,
  stopAcpServer,
  KIMI_MIN_VERSION,
} from "./providers/kimi.mjs";

const FIXTURE = resolve(
  import.meta.dirname,
  "../rust/crates/atelier-providers/tests/fixtures/fake_kimi_acp.mjs",
);

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-setup-test-"));
  const wrapper = join(tmp, "kimi");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${FIXTURE}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  process.env.ATELIER_KIMI_BIN = wrapper;
});
afterAll(() => {
  stopAcpServer();
  delete process.env.ATELIER_KIMI_BIN;
  delete process.env.FAKE_KIMI_MODE;
  rmSync(tmp, { recursive: true, force: true });
});
afterEach(() => {
  stopAcpServer();
  delete process.env.FAKE_KIMI_MODE;
});

describe("compareKimiVersions", () => {
  it("ordonne correctement les versions a.b.c", () => {
    expect(compareKimiVersions("0.26.0", "0.26.0")).toBe(0);
    expect(compareKimiVersions("0.25.9", "0.26.0")).toBeLessThan(0);
    expect(compareKimiVersions("0.26.1", "0.26.0")).toBeGreaterThan(0);
    expect(compareKimiVersions("1.0.0", "0.26.0")).toBeGreaterThan(0);
    expect(compareKimiVersions("0.26", "0.26.0")).toBe(0);
  });
});

describe("deriveKimiSetupState (dérivation pure, exhaustive)", () => {
  const base = { binPath: "/x/kimi", version: "0.26.0", protocolOk: true, authRequired: false, probeError: null, modelCount: 2 };
  it.each([
    [{ ...base, binPath: null }, "not_installed"],
    [{ ...base, version: "0.20.0" }, "version_unsupported"],
    [{ ...base, probeError: "spawn failed" }, "protocol_error"],
    [{ ...base, protocolOk: false }, "protocol_error"],
    [{ ...base, authRequired: true }, "login_needed"],
    [{ ...base, modelCount: 0 }, "model_config_needed"],
    [base, "ready"],
  ])("%o → %s", (input, expected) => {
    expect(deriveKimiSetupState(input)).toBe(expected);
  });

  it("version inconnue (null) n'est pas bloquante — le probe tranche", () => {
    expect(deriveKimiSetupState({ ...base, version: null })).toBe("ready");
  });
});

describe("résolution du binaire", () => {
  it("ATELIER_KIMI_BIN prioritaire quand le fichier existe", () => {
    expect(resolveKimiBin()).toBe(join(tmp, "kimi"));
  });

  it("shadowedOfficialInstall : signale ~/.kimi-code masqué par un autre binaire", () => {
    const official = join(process.env.HOME ?? "", ".kimi-code", "bin", "kimi");
    const shadowed = shadowedOfficialInstall(join(tmp, "kimi"));
    // sur une machine sans installation officielle : null ; sinon le chemin officiel
    expect(shadowed === null || shadowed === official).toBe(true);
    // le binaire officiel lui-même n'est jamais « masqué »
    expect(shadowedOfficialInstall(official)).toBeNull();
  });
});

describe("setupProbe contre le fixture (sans quota, jamais session/prompt)", () => {
  it("nominal + modèles découverts → ready, commande de login tirée d'authMethods", async () => {
    const probe = await setupProbe({
      version: "0.26.0",
      listModels: async () => ({ models: ["kimi-for-coding"], defaultModel: "kimi-for-coding" }),
    });
    expect(probe.state).toBe("ready");
    expect(probe.models).toBe(1);
    // authMethods du fixture : _meta terminal-auth {command:/fake/bin/kimi, args:[login]}
    expect(probe.loginCommand).toBe("/fake/bin/kimi login");
  });

  it("nominal sans modèle configuré → model_config_needed", async () => {
    const probe = await setupProbe({
      version: "0.26.0",
      listModels: async () => ({ models: [], defaultModel: "" }),
    });
    expect(probe.state).toBe("model_config_needed");
  });

  it("authenticate → -32000 ⇒ login_needed", async () => {
    process.env.FAKE_KIMI_MODE = "auth_required";
    const probe = await setupProbe({ version: "0.26.0" });
    expect(probe.state).toBe("login_needed");
  });

  it("version < 0.26.0 ⇒ version_unsupported (visible mais pas prêt)", async () => {
    const probe = await setupProbe({ version: "0.20.0" });
    expect(probe.state).toBe("version_unsupported");
    expect(probe.version).toBe("0.20.0");
  });

  it("agent inattendu (old_version du fixture = 0.20.0 annoncé au handshake) : la version CLI prime", async () => {
    // le fixture old_version répond toujours protocolVersion 1 + nom Kimi ⇒
    // c'est la version CLI (--version) qui gate, pas le handshake
    process.env.FAKE_KIMI_MODE = "old_version";
    const probe = await setupProbe({
      version: "0.26.0",
      listModels: async () => ({ models: ["m"], defaultModel: "m" }),
    });
    expect(probe.state).toBe("ready");
  });
});

describe("catalogFromProviderList (miroir du test Rust)", () => {
  it("dérive le thinking des capabilities — always_thinking sans off", () => {
    // Shape réel du binaire 0.26.0 configuré (sonde 2026-07-18).
    const { models, modelReasoning } = catalogFromProviderList({
      providers: { "managed:kimi-code": { type: "kimi" } },
      models: {
        "kimi-code/k3": { displayName: "K3", capabilities: ["thinking", "always_thinking", "tool_use"] },
        "kimi-code/opt": { capabilities: ["thinking", "tool_use"] },
        "kimi-code/none": { capabilities: ["tool_use"] },
      },
    });
    expect(models).toHaveLength(3);
    expect(modelReasoning["kimi-code/k3"]).toEqual({ supported_efforts: ["on"], default_effort: "on" });
    expect(modelReasoning["kimi-code/opt"].supported_efforts).toEqual(["off", "on"]);
    expect(modelReasoning["kimi-code/none"]).toBeUndefined();
  });
  it("catalogue vide : rien d'inventé", () => {
    const { models, modelReasoning } = catalogFromProviderList({ providers: {}, models: {} });
    expect(models).toEqual([]);
    expect(modelReasoning).toEqual({});
  });
});
