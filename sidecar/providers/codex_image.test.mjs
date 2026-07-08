import { describe, it, expect, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImageViaCodex, CODEX_IMAGE_MODEL } from "./codex_image.mjs";

const tmpDirs = [];
function freshImagesDir() {
  const d = mkdtempSync(join(tmpdir(), "codex-images-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => { while (tmpDirs.length) { try { rmSync(tmpDirs.pop(), { recursive: true, force: true }); } catch {} } });

// Faux `spawn` : simule Codex qui dépose un PNG dans son store (imagesDir),
// dans un sous-dossier de session, puis termine — sans jamais toucher au cwd.
function fakeSpawn({ imagesDir, writePng = true, code = 0, fail = false, bytes = "PNGDATA" } = {}) {
  return (_bin, args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    queueMicrotask(() => {
      if (fail) { proc.emit("error", new Error("ENOENT codex")); return; }
      if (writePng && imagesDir) {
        const sess = join(imagesDir, "019f-session");
        mkdirSync(sess, { recursive: true });
        writeFileSync(join(sess, "ig_test.png"), Buffer.from(bytes));
      }
      proc.stdout.emit("data", Buffer.from("codex: generating\n"));
      proc.emit("close", code);
    });
    return proc;
  };
}

describe("generateImageViaCodex", () => {
  it("récupère l'image dans le store Codex (pas de copie demandée)", async () => {
    const imagesDir = freshImagesDir();
    const r = await generateImageViaCodex({
      prompt: "un glacier", size: "1K", imagesDir,
      spawnImpl: fakeSpawn({ imagesDir, bytes: "GLACIER" }),
    });
    expect(r.model).toBe(CODEX_IMAGE_MODEL);
    expect(r.size).toBe("1K");
    expect(Buffer.from(r.b64, "base64").toString()).toBe("GLACIER");
  });

  it("échoue proprement si aucun PNG n'est produit", async () => {
    const imagesDir = freshImagesDir();
    await expect(generateImageViaCodex({
      prompt: "x", imagesDir, spawnImpl: fakeSpawn({ imagesDir, writePng: false }),
    })).rejects.toThrow(/aucune image/);
  });

  it("propage une erreur de spawn (codex introuvable)", async () => {
    const imagesDir = freshImagesDir();
    await expect(generateImageViaCodex({
      prompt: "x", imagesDir, spawnImpl: fakeSpawn({ imagesDir, fail: true }),
    })).rejects.toThrow(/codex exec/);
  });

  it("refuse un prompt vide", async () => {
    const imagesDir = freshImagesDir();
    await expect(generateImageViaCodex({
      prompt: "   ", imagesDir, spawnImpl: fakeSpawn({ imagesDir }),
    })).rejects.toThrow(/prompt/);
  });

  it("force image_generation, low effort, stdin fermé et ne demande jamais de sauver", async () => {
    const imagesDir = freshImagesDir();
    let captured;
    await generateImageViaCodex({
      prompt: "un glacier", imagesDir,
      spawnImpl: (bin, args, opts) => { captured = { args, opts }; return fakeSpawn({ imagesDir })(bin, args); },
    });
    const instruction = captured.args[captured.args.length - 1];
    expect(captured.args).toContain("exec");
    expect(captured.args).toContain("workspace-write");
    expect(captured.args).toContain("model_reasoning_effort=low");
    expect(instruction).toContain("image_generation");
    expect(instruction).not.toContain("out.png");        // on ne demande PAS de copier
    expect(instruction.toLowerCase()).toContain("do not save");
    expect(captured.opts.stdio[0]).toBe("ignore");        // stdin fermé
  });
});
