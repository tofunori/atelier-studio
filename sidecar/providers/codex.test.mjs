import { describe, expect, it } from "vitest";
import { buildCodexAppServerArgs, buildCodexInput, buildThreadOptions } from "./codex.mjs";
import { encodeAgentModel } from "./agent_models.mjs";

describe("codex provider helpers (app-server)", () => {
  it("emballe une entrée texte simple au format UserInput", () => {
    expect(buildCodexInput({ prompt: "Salut" })).toEqual([
      { type: "text", text: "Salut", text_elements: [] },
    ]);
  });

  it("construit une entrée structurée avec images locales", () => {
    expect(buildCodexInput({
      prompt: "Décris",
      imagePath: "/tmp/a.png",
      attachments: [{ path: "/tmp/b.jpg" }, { imagePath: "/tmp/a.png" }],
    })).toEqual([
      { type: "text", text: "Décris", text_elements: [] },
      { type: "localImage", path: "/tmp/a.png" },
      { type: "localImage", path: "/tmp/b.jpg" },
    ]);
  });

  it("nettoie les inputs structurés fournis par le router", () => {
    expect(buildCodexInput({
      inputs: [
        { type: "text", text: "Lis" },
        { type: "local_image", path: "/tmp/ui.png" },
        { type: "local_image" },
      ],
    })).toEqual([
      { type: "text", text: "Lis", text_elements: [] },
      { type: "localImage", path: "/tmp/ui.png" },
    ]);
  });

  it("expose les options de thread app-server", () => {
    expect(buildThreadOptions({
      cwd: "/repo",
      model: "gpt-5.5",
      effort: "high",
      webSearch: true,
      additionalDirectories: ["/extra"],
    })).toEqual({
      cwd: "/repo",
      model: "gpt-5.5",
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      config: {
        web_search: "live",
        sandbox_workspace_write: { writable_roots: ["/extra"] },
      },
      effortHint: "high",
    });
  });

  it("garde le sandbox demandé (reviewer read-only)", () => {
    expect(buildThreadOptions({ cwd: "/repo", sandbox: "read-only" }).sandbox).toBe("read-only");
  });

  it("place les choix agent Codex dans modelProvider et config", () => {
    const model = encodeAgentModel({
      runtime: "codex",
      sourceProviderId: "openrouter",
      model: "z-ai/glm-5.2",
    });
    expect(buildThreadOptions({
      cwd: "/repo",
      model,
      agentProviderConfigs: [{
        id: "openrouter",
        label: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        protocol: "openai",
        apiKey: "sk-test",
        models: ["z-ai/glm-5.2"],
      }],
    })).toMatchObject({
      model: "z-ai/glm-5.2",
      modelProvider: "openrouter",
      config: {
        model_provider: "openrouter",
        model_providers: {
          openrouter: {
            base_url: "https://openrouter.ai/api/v1",
            wire_api: "responses",
            env_key: "ATELIER_CODEX_OPENROUTER_API_KEY",
          },
        },
      },
    });
  });

  it("lance le app-server avec les providers agent en config de demarrage", () => {
    const args = buildCodexAppServerArgs([{
      id: "openrouter",
      label: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      protocol: "openai",
      apiKey: "sk-test",
      models: ["z-ai/glm-5.2"],
    }]);
    const joined = args.join(" ");
    expect(args[0]).toBe("app-server");
    expect(joined).toContain('model_providers.openrouter.base_url="https://openrouter.ai/api/v1"');
    expect(joined).toContain('model_providers.openrouter.env_key="ATELIER_CODEX_OPENROUTER_API_KEY"');
    expect(joined).not.toContain("sk-test");
  });
});
