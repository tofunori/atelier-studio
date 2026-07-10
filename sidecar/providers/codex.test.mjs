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

describe("câblage des politiques dans buildThreadOptions (plan 025 step 4)", () => {
  it("permissionMode résolu quand aucun sandbox explicite", () => {
    const o = buildThreadOptions({ cwd: "/repo", permissionMode: "acceptEdits" });
    expect(o.sandbox).toBe("workspace-write");
    expect(o.approvalPolicy).toBe("on-request");
  });

  it("mode Ask → workspace-write / untrusted", () => {
    const o = buildThreadOptions({ cwd: "/repo", permissionMode: "default" });
    expect(o.sandbox).toBe("workspace-write");
    expect(o.approvalPolicy).toBe("untrusted");
  });

  it("mode Plan → read-only/never + collaborationModeHint (retiré des options RPC)", () => {
    const o = buildThreadOptions({ cwd: "/repo", model: "gpt-5.5", permissionMode: "plan" });
    expect(o.sandbox).toBe("read-only");
    expect(o.approvalPolicy).toBe("never");
    expect(o.collaborationModeHint).toEqual({ mode: "plan", settings: { model: "gpt-5.5" } });
  });

  it("un sandbox EXPLICITE (reviewer read-only) prime sur le mode de permission", () => {
    const o = buildThreadOptions({ cwd: "/repo", sandbox: "read-only", permissionMode: "bypassPermissions" });
    expect(o.sandbox).toBe("read-only");
    expect(o.approvalPolicy).toBe("never");
  });

  it("mode inconnu → repli sûr + diagnostic transporté en hint", () => {
    const o = buildThreadOptions({ cwd: "/repo", permissionMode: "n-importe-quoi" });
    expect(o.sandbox).toBe("read-only");
    expect(o.approvalPolicy).toBe("on-request");
    expect(String(o.safetyDiagnosticHint)).toContain("inconnu");
  });

  it("additionalDirectories ne devient PAS writable en read-only", () => {
    const o = buildThreadOptions({ cwd: "/repo", permissionMode: "plan", additionalDirectories: ["/extra"] });
    expect(o.config?.sandbox_workspace_write).toBeUndefined();
    const w = buildThreadOptions({ cwd: "/repo", permissionMode: "acceptEdits", additionalDirectories: ["/extra"] });
    expect(w.config?.sandbox_workspace_write).toEqual({ writable_roots: ["/extra"] });
  });
});

describe("describeServerRequest / answerFromInteraction (plan 025 step 5)", () => {
  it("requestUserInput → spec user_input avec fields, secret, allowOther, autoResolutionMs", async () => {
    const { describeServerRequest } = await import("./codex.mjs");
    const spec = describeServerRequest("item/tool/requestUserInput", {
      threadId: "t", turnId: "u", itemId: "it-1", autoResolutionMs: 30000,
      questions: [
        { id: "q1", header: "Token", question: "Ton token API ?", isSecret: true },
        { id: "q2", header: "Choix", question: "Quelle option ?", isOther: true,
          options: [{ label: "A", description: "la première" }, { label: "B" }] },
      ],
    });
    expect(spec.interactionType).toBe("user_input");
    expect(spec.autoResolutionMs).toBe(30000);
    expect(spec.itemId).toBe("it-1");
    expect(spec.fields).toHaveLength(2);
    expect(spec.fields[0]).toMatchObject({ id: "q1", secret: true, allowOther: false });
    expect(spec.fields[1]).toMatchObject({ id: "q2", allowOther: true });
    expect(spec.fields[1].options).toEqual([
      { label: "A", description: "la première" },
      { label: "B" },
    ]);
  });

  it("elicitation form → fields depuis requestedSchema ; mode url → domaine seul", async () => {
    const { describeServerRequest } = await import("./codex.mjs");
    const form = describeServerRequest("mcpServer/elicitation/request", {
      serverName: "zotero", threadId: "t", turnId: "u", mode: "form",
      message: "Configurer l'accès",
      requestedSchema: { type: "object", properties: { apiKey: { type: "string", title: "Clé API" } }, required: ["apiKey"] },
    });
    expect(form.interactionType).toBe("mcp_elicitation");
    expect(form.title).toContain("zotero");
    expect(form.fields[0]).toMatchObject({ id: "apiKey", question: "Clé API", required: true });

    const url = describeServerRequest("mcpServer/elicitation/request", {
      serverName: "auth", mode: "url", message: "Connexion requise", url: "https://example.com/oauth?x=1",
    });
    expect(url.urlDomain).toBe("example.com");
    expect(url.fields).toBeUndefined();
  });

  it("approbations → spec approval avec détail ; item/tool/call → null (non relayé)", async () => {
    const { describeServerRequest } = await import("./codex.mjs");
    const a = describeServerRequest("item/commandExecution/requestApproval", { command: "rm -rf /tmp/x" });
    expect(a.interactionType).toBe("approval");
    expect(a.detail).toContain("rm -rf");
    expect(describeServerRequest("item/tool/call", {})).toBeNull();
  });

  it("answerFromInteraction : enums d'approbation, réponses, refus sûrs", async () => {
    const { answerFromInteraction } = await import("./codex.mjs");
    expect(answerFromInteraction("item/commandExecution/requestApproval", {}, { allow: true }))
      .toEqual({ decision: "accept" });
    expect(answerFromInteraction("execCommandApproval", {}, null))
      .toEqual({ decision: "denied" });
    expect(answerFromInteraction("item/tool/requestUserInput", {}, { answers: { q1: "oui" } }))
      .toEqual({ answers: { q1: "oui" } });
    expect(answerFromInteraction("item/tool/requestUserInput", {}, null))
      .toEqual({ answers: {} });
    expect(answerFromInteraction("mcpServer/elicitation/request", {}, { action: "accept", content: { a: "1" } }))
      .toEqual({ action: "accept", content: { a: "1" }, _meta: null });
    expect(answerFromInteraction("mcpServer/elicitation/request", {}, null))
      .toEqual({ action: "decline", content: null, _meta: null });
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
