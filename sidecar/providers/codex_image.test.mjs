import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { generateImageViaCodex, CODEX_IMAGE_MODEL } from "./codex_image.mjs";

// Faux `spawn` : lit le workdir dans les args (après -C), y écrit out.png,
// émet quelques lignes de log puis close.
function fakeSpawn({ writePng = true, code = 0, fail = false } = {}) {
  return (_bin, args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    const work = args[args.indexOf("-C") + 1];
    queueMicrotask(() => {
      if (fail) { proc.emit("error", new Error("ENOENT codex")); return; }
      if (writePng) writeFileSync(`${work}/out.png`, Buffer.from("PNGDATA"));
      proc.stdout.emit("data", Buffer.from("codex: generating\n"));
      proc.emit("close", code);
    });
    return proc;
  };
}

describe("generateImageViaCodex", () => {
  it("génère et renvoie le b64 de out.png", async () => {
    const r = await generateImageViaCodex({ prompt: "un glacier", size: "1K", spawnImpl: fakeSpawn() });
    expect(r.model).toBe(CODEX_IMAGE_MODEL);
    expect(r.size).toBe("1K");
    expect(Buffer.from(r.b64, "base64").toString()).toBe("PNGDATA");
  });

  it("échoue proprement si aucun PNG n'est produit", async () => {
    await expect(generateImageViaCodex({ prompt: "x", spawnImpl: fakeSpawn({ writePng: false }) }))
      .rejects.toThrow(/aucune image/);
  });

  it("propage une erreur de spawn (codex introuvable)", async () => {
    await expect(generateImageViaCodex({ prompt: "x", spawnImpl: fakeSpawn({ fail: true }) }))
      .rejects.toThrow(/codex exec/);
  });

  it("refuse un prompt vide", async () => {
    await expect(generateImageViaCodex({ prompt: "   ", spawnImpl: fakeSpawn() }))
      .rejects.toThrow(/prompt/);
  });

  it("force l'outil image_generation et la sauvegarde out.png", async () => {
    let captured;
    await generateImageViaCodex({
      prompt: "un glacier",
      spawnImpl: (bin, args) => { captured = args; return fakeSpawn()(bin, args); },
    });
    const instruction = captured[captured.length - 1];
    expect(captured).toContain("exec");
    expect(captured).toContain("workspace-write");
    expect(captured).toContain("--skip-git-repo-check");
    expect(instruction).toContain("image_generation");
    expect(instruction).toContain("out.png");
  });
});
