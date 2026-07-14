import { describe, expect, it } from "vitest";
import { contextWindowFor, getProvider, listProviders } from "./registry.mjs";

describe("provider registry", () => {
  it("defaults Claude to Sonnet 5 with a 1M context", () => {
    expect(getProvider("claude")?.defaultModel).toBe("claude-sonnet-5[1m]");
  });

  it("exposes the current Codex app-server model catalog", () => {
    const provider = getProvider("codex");
    expect(provider).toBeTruthy();
    expect(provider.defaultModel).toBe("gpt-5.6-sol");
    expect(provider.models).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex",
    ]);
    expect(provider.capabilities).toMatchObject({ resume: true, steering: true, goals: true });
  });

  it("exposes only OpenRouter-backed OpenCode models", () => {
    const provider = getProvider("opencode");
    expect(provider).toBeTruthy();
    expect(provider.models).not.toContain("opencode/north-mini-code-free");
    expect(provider.models.every((model) => model.startsWith("openrouter/"))).toBe(true);
  });
});

// Plan 025, step 9 : le sidecar est l'autorité des capabilities — le composer
// n'affiche que les contrôles annoncés ici.
describe("provider capabilities (plan 025, step 9)", () => {
  const CAP_KEYS = [
    "resume", "steering", "queue", "goals", "tools", "toolOutput",
    "permissions", "interactiveInput", "mcpElicitation", "durableHistory",
    "permissionModes",
  ];

  it("listProviders expose des capabilities complètes pour chaque provider", () => {
    const providers = listProviders();
    expect(providers.length).toBeGreaterThan(0);
    for (const p of providers) {
      expect(p.capabilities, `capabilities manquantes pour ${p.id}`).toBeTruthy();
      for (const key of CAP_KEYS) {
        expect(p.capabilities, `${p.id}: champ ${key} absent`).toHaveProperty(key);
      }
      expect(Array.isArray(p.capabilities.permissionModes), `${p.id}: permissionModes doit être un tableau`).toBe(true);
    }
  });

  it("claude : sortie d'outils relayée + 4 modes de permission", () => {
    const caps = getProvider("claude").capabilities;
    expect(caps.toolOutput).toBe(true);
    expect(caps.permissions).toBe(true);
    expect(caps.permissionModes).toEqual(["default", "acceptEdits", "plan", "bypassPermissions"]);
  });

  it("codex : input interactif, queue et mêmes modes de permission", () => {
    const caps = getProvider("codex").capabilities;
    expect(caps.interactiveInput).toBe(true);
    expect(caps.queue).toBe(true);
    expect(caps.permissionModes).toEqual(["default", "acceptEdits", "plan", "bypassPermissions"]);
  });

  it("grok : pas de permissions (permissionModes vide)", () => {
    const caps = getProvider("grok").capabilities;
    expect(caps.permissions).toBe(false);
    expect(caps.permissionModes).toEqual([]);
  });

  it("providers API chat-only : tools:false, sans permissions", () => {
    // dépend du api_providers.json de la machine : la boucle vaut pour zéro
    // ou plusieurs entrées — chaque provider API doit rester chat pur
    for (const p of listProviders().filter((x) => x.kind === "api")) {
      expect(p.capabilities.tools, `${p.id}: un provider API reste chat-only`).toBe(false);
      expect(p.capabilities.permissionModes).toEqual([]);
    }
  });

  it("permissionModes cohérents avec permissions pour tous les providers", () => {
    for (const p of listProviders()) {
      expect(
        p.capabilities.permissionModes.length > 0,
        `${p.id}: permissions=${p.capabilities.permissions} mais permissionModes=${JSON.stringify(p.capabilities.permissionModes)}`,
      ).toBe(p.capabilities.permissions === true);
    }
  });
});

describe("contextWindowFor (inchangé)", () => {
  it("résout grok-4.5 et ses variantes datées", () => {
    expect(contextWindowFor("grok-4.5")).toBe(500_000);
    expect(contextWindowFor("grok-4.5-latest")).toBe(500_000);
  });

  it("renvoie null pour un modèle inconnu ou vide", () => {
    expect(contextWindowFor("claude-fable-5")).toBeNull();
    expect(contextWindowFor("")).toBeNull();
  });
});
