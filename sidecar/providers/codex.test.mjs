import { describe, expect, it } from "vitest";
import {
  buildApprovalResponse,
  buildCodexAppServerArgs,
  buildCodexInput,
  buildServerRequestFallback,
  buildThreadOptions,
  normalizeCodexEffort,
} from "./codex.mjs";

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

  it("normalise l'effort Codex minimal vers low pour préserver les tool calls", () => {
    expect(normalizeCodexEffort("minimal")).toBe("low");
    expect(buildThreadOptions({ cwd: "/repo", effort: "minimal" }).effortHint).toBe("low");
  });

  it("répond aux approvals avec les enums attendus par chaque API Codex", () => {
    expect(buildApprovalResponse("execCommandApproval", true)).toEqual({ decision: "approved" });
    expect(buildApprovalResponse("execCommandApproval", false)).toEqual({ decision: "denied" });
    expect(buildApprovalResponse("item/commandExecution/requestApproval", true)).toEqual({ decision: "accept" });
    expect(buildApprovalResponse("item/fileChange/requestApproval", false)).toEqual({ decision: "decline" });
  });

  it("répond aux demandes de permissions additionnelles sans escalade hors full-access", () => {
    const params = { permissions: { network: { enabled: true }, fileSystem: { read: ["/x"], write: ["/y"] } } };
    expect(buildApprovalResponse("item/permissions/requestApproval", true, params)).toEqual({
      permissions: params.permissions,
      scope: "turn",
      strictAutoReview: false,
    });
    expect(buildApprovalResponse("item/permissions/requestApproval", false, params)).toEqual({
      permissions: {},
      scope: "turn",
      strictAutoReview: true,
    });
  });

  it("renvoie des fallbacks structurés pour les server-requests client non supportées", () => {
    expect(buildServerRequestFallback("item/tool/call")).toMatchObject({ success: false });
    expect(buildServerRequestFallback("item/tool/requestUserInput")).toEqual({ answers: {} });
    expect(buildServerRequestFallback("mcpServer/elicitation/request")).toEqual({
      action: "decline",
      content: null,
      _meta: null,
    });
  });

  it("lance le app-server Codex sans providers externes globaux", () => {
    expect(buildCodexAppServerArgs()).toEqual(["app-server"]);
  });
});
