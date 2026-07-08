// Provider images via le CLI Codex (gpt-image-2, authentifié sur l'abonnement
// ChatGPT — aucune clé API, aucune facturation à l'image ; ça consomme le quota
// de l'abonnement). On shelle `codex exec` dans un dossier temporaire jetable
// (le sandbox Codex n'autorise l'écriture que dans son cwd), Codex sauve out.png,
// on le relit en base64 pour rejoindre le même chemin que le provider BytePlus.
//
// Robustesse héritée du pont open-source claude-gpt-image-bridge :
// - dossier de travail privé + instruction explicite « save as out.png »
//   (jamais laisser Codex écrire au chemin final : le sandbox le refuserait) ;
// - repli sur le PNG le plus récent si Codex nomme le fichier autrement ;
// - il faut FORCER l'outil image_generation (sinon Codex fabrique un PNG en
//   Python, ce qui gâche le quota et donne une image inutile).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBin } from "./../bin_resolver.mjs";

const CODEX_BIN = resolveBin("codex") ?? "codex";
export const CODEX_IMAGE_MODEL = "gpt-image-2";

function sizeHint(size) {
  if (size === "1K") return "around 1024 pixels on the long side";
  if (size === "2K") return "around 2048 pixels on the long side, high detail";
  return "";
}

function newestPng(dir) {
  try {
    const pngs = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .map((f) => join(dir, f));
    pngs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return pngs[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Génère une image via `codex exec` (gpt-image-2). Renvoie { b64, size, model, usage }
 * pour rester interchangeable avec le provider BytePlus.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.size] "1K" | "2K"
 * @param {string} [opts.editImagePath] image locale à éditer (déposée comme input.png)
 * @param {number} [opts.timeoutMs] défaut 10 min (latence observée ~85 s, doc jusqu'à ~6 min)
 * @param {Function} [opts.spawnImpl] pour les tests
 */
export function generateImageViaCodex({
  prompt,
  size = "2K",
  editImagePath = null,
  timeoutMs = 600000,
  spawnImpl = spawn,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!prompt || !String(prompt).trim()) return reject(new Error("prompt requis"));

    const work = mkdtempSync(join(tmpdir(), "atelier-codeximg-"));
    const cleanup = () => { try { rmSync(work, { recursive: true, force: true }); } catch {} };

    let inputNote = "";
    if (editImagePath && existsSync(editImagePath)) {
      try {
        copyFileSync(editImagePath, join(work, "input.png"));
        inputNote = " Use input.png in the current directory as the reference image to edit.";
      } catch {}
    }

    const hint = sizeHint(size);
    const instruction =
      `Use the image_generation tool (do NOT write Python, do NOT fabricate a PNG) to generate this image: ${String(prompt)}.` +
      (hint ? ` Target resolution ${hint}.` : "") +
      inputNote +
      ` Save the resulting image as out.png in the current working directory.`;

    const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", work, instruction];

    let proc;
    try {
      proc = spawnImpl(CODEX_BIN, args, { cwd: work });
    } catch (e) {
      cleanup();
      return reject(new Error(`codex introuvable: ${String(e?.message ?? e)}`));
    }

    let logTail = "";
    const capture = (d) => { logTail = (logTail + d.toString()).slice(-2000); };
    proc.stdout?.on("data", capture);
    proc.stderr?.on("data", capture);

    const killer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      cleanup();
      reject(new Error("codex exec: délai dépassé"));
    }, timeoutMs);

    proc.on("error", (e) => {
      clearTimeout(killer);
      cleanup();
      reject(new Error(`codex exec: ${String(e?.message ?? e)}`));
    });

    proc.on("close", (code) => {
      clearTimeout(killer);
      try {
        let png = join(work, "out.png");
        if (!existsSync(png)) png = newestPng(work);
        if (!png || !existsSync(png)) {
          cleanup();
          return reject(new Error(`codex exec: aucune image générée (code ${code}). ${logTail.slice(-300)}`));
        }
        const b64 = readFileSync(png).toString("base64");
        cleanup();
        resolve({ b64, size, model: CODEX_IMAGE_MODEL, usage: null });
      } catch (e) {
        cleanup();
        reject(new Error(`codex exec: lecture image impossible: ${String(e?.message ?? e)}`));
      }
    });
  });
}
