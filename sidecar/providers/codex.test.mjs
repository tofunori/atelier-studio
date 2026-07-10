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

// Plan 025 step 4 : quatre modes de permission Atelier → quatre politiques
// Codex explicites (schéma codex-cli 0.142.5). Aucun mode non « Full access »
// ne peut retomber sur danger-full-access. Import paresseux : tant que le
// helper n'existe pas, seuls CES tests échouent.
describe("resolveCodexSafety (plan 025)", () => {
  const load = async () => {
    const m = await import("./codex.mjs");
    expect(typeof m.resolveCodexSafety, "resolveCodexSafety doit être exporté").toBe("function");
    return m.resolveCodexSafety;
  };

  it("Full access (bypassPermissions) → danger-full-access / never", async () => {
    const resolveCodexSafety = await load();
    const s = resolveCodexSafety("bypassPermissions", { model: "gpt-5.3-codex" });
    expect(s.sandbox).toBe("danger-full-access");
    expect(s.approvalPolicy).toBe("never");
    expect(s.collaborationMode).toBeUndefined();
  });

  it("Accept edits (acceptEdits) → workspace-write / on-request", async () => {
    const resolveCodexSafety = await load();
    const s = resolveCodexSafety("acceptEdits", { model: "gpt-5.3-codex" });
    expect(s.sandbox).toBe("workspace-write");
    expect(s.approvalPolicy).toBe("on-request");
    expect(s.collaborationMode).toBeUndefined();
  });

  it("Ask (default) → workspace-write / untrusted", async () => {
    const resolveCodexSafety = await load();
    const s = resolveCodexSafety("default", { model: "gpt-5.3-codex" });
    expect(s.sandbox).toBe("workspace-write");
    expect(s.approvalPolicy).toBe("untrusted");
  });

  it("Plan → read-only / never, collaborationMode plan RÉEL (settings.model requis)", async () => {
    const resolveCodexSafety = await load();
    const s = resolveCodexSafety("plan", { model: "gpt-5.3-codex" });
    expect(s.sandbox).toBe("read-only");
    expect(s.approvalPolicy).toBe("never");
    expect(s.collaborationMode?.mode).toBe("plan");
    // le protocole exige settings.model — jamais un objet plan incomplet
    expect(s.collaborationMode?.settings?.model).toBe("gpt-5.3-codex");
  });

  it("mode inconnu → repli SÛR read-only/on-request + diagnostic, jamais danger-full-access", async () => {
    const resolveCodexSafety = await load();
    for (const weird of ["yolo", "", undefined, null, "DANGER"]) {
      const s = resolveCodexSafety(weird, { model: "m" });
      expect(s.sandbox).toBe("read-only");
      expect(s.approvalPolicy).toBe("on-request");
      expect(String(s.diagnostic ?? "")).not.toBe("");
    }
  });

  it("aucun mode non-Full ne produit danger-full-access", async () => {
    const resolveCodexSafety = await load();
    for (const mode of ["acceptEdits", "default", "plan", "autre-chose"]) {
      expect(resolveCodexSafety(mode, { model: "m" }).sandbox).not.toBe("danger-full-access");
    }
  });
});
