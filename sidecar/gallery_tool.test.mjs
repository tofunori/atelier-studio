import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGalleryCommand, postGalleryCommand } from "./gallery_tool_cli.mjs";
import { withGalleryToolInstruction } from "./gallery_tool_prompt.mjs";
import { validGalleryCommand } from "./gallery_command.mjs";

describe("outil chat → Galerie", () => {
  it("normalise et déduplique uniquement des fichiers du projet", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-gallery-tool-"));
    mkdirSync(join(root, "figures"));
    writeFileSync(join(root, "figures", "a.png"), "a");
    const command = buildGalleryCommand([
      "show", "--project-root", root, "--", "figures/a.png", join(root, "figures", "a.png"),
    ], { requestId: "req-1" });
    expect(command).toEqual({
      action: "show", mode: "focus", projectRoot: realpathSync(root), requestId: "req-1", rels: ["figures/a.png"],
    });
    expect(() => buildGalleryCommand(["show", "--project-root", root, "--", "../secret.txt"]))
      .toThrow(/hors projet/);
  });

  it("poste la commande avec le token du lock sans l’exposer dans le résultat", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gallery-lock-"));
    const lockPath = join(dir, "sidecar.lock");
    writeFileSync(lockPath, JSON.stringify({ port: 19444, token: "secret-token" }));
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202, text: async () => '{"ok":true,"queued":true}' }));
    await expect(postGalleryCommand({ action: "show" }, { lockPath, fetchImpl })).resolves.toEqual({ ok: true, queued: true });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:19444/gallery-command", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-atelier-token": "secret-token" }),
    }));
  });

  it("construit open, compare et reset avec un contrat strict", () => {
    const root = mkdtempSync(join(tmpdir(), "atelier-gallery-actions-"));
    mkdirSync(join(root, "figures"));
    writeFileSync(join(root, "figures", "a.png"), "a");
    writeFileSync(join(root, "figures", "b.png"), "b");
    expect(buildGalleryCommand(["open", "--project-root", root, "--", "figures/a.png"], { requestId: "open-1" }))
      .toMatchObject({ action: "open", mode: "viewer", rels: ["figures/a.png"] });
    expect(buildGalleryCommand(["compare", "--project-root", root, "--", "figures/a.png", "figures/b.png"], { requestId: "compare-1" }))
      .toMatchObject({ action: "compare", mode: "selection", rels: ["figures/a.png", "figures/b.png"] });
    expect(buildGalleryCommand(["reset", "--project-root", root], { requestId: "reset-1" }))
      .toMatchObject({ action: "reset", mode: "all", rels: [] });
    expect(() => buildGalleryCommand(["compare", "--project-root", root, "--", "figures/a.png"]))
      .toThrow(/au moins deux/);
  });

  it("ajoute une instruction explicite au provider sans modifier le texte affiché", () => {
    const enriched = withGalleryToolInstruction("montre-moi ces figures", { projectRoot: "/p", toolPath: "/app/atelier-gallery-tool" });
    expect(enriched).toContain("montre-moi ces figures");
    expect(enriched).toContain('"/app/atelier-gallery-tool" show --project-root "/p"');
    expect(enriched).toContain("Do not merely list paths");
  });

  it("refuse les charges ambiguës ou les chemins hors projet à la frontière HTTP", () => {
    const valid = { action: "show", mode: "focus", projectRoot: "/p", requestId: "r1", rels: ["figures/a.png"] };
    expect(validGalleryCommand(valid)).toBe(true);
    expect(validGalleryCommand({ ...valid, rels: ["../secret"] })).toBe(false);
    expect(validGalleryCommand({ ...valid, unexpected: true })).toBe(false);
    expect(validGalleryCommand({ ...valid, action: "reset", mode: "all", rels: [] })).toBe(true);
    expect(validGalleryCommand({ ...valid, action: "open", mode: "viewer", rels: ["figures/a.png", "figures/b.png"] })).toBe(false);
  });
});
