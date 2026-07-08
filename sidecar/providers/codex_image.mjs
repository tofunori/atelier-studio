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
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { resolveBin } from "./../bin_resolver.mjs";

const CODEX_BIN = resolveBin("codex") ?? "codex";
export const CODEX_IMAGE_MODEL = "gpt-image-2";
// Codex écrit ses images générées ici (un sous-dossier de session par run).
const CODEX_IMAGES_DIR = join(homedir(), ".codex", "generated_images");

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

/** PNG le plus récent sous le store codex (récursif sur les sous-dossiers de
 *  session), créé depuis `sinceMs`. C'est NOTRE code qui récupère l'image :
 *  on ne demande jamais à Codex de la copier (ça déclenche une commande shell
 *  qui, sans TTY, attend une approbation et gèle le run). */
function newestCodexImageSince(baseDir, sinceMs) {
  let best = null;
  let bestMs = sinceMs;
  let sessions;
  try { sessions = readdirSync(baseDir); } catch { return null; }
  for (const s of sessions) {
    const dir = join(baseDir, s);
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.toLowerCase().endsWith(".png")) continue;
      const p = join(dir, f);
      let m;
      try { m = statSync(p).mtimeMs; } catch { continue; }
      if (m >= bestMs) { bestMs = m; best = p; }
    }
  }
  return best;
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
  imagesDir = CODEX_IMAGES_DIR,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!prompt || !String(prompt).trim()) return reject(new Error("prompt requis"));

    // -2 s de tolérance d'horloge : on récupérera le PNG créé après ce point.
    const sinceMs = Date.now() - 2000;
    const work = mkdtempSync(join(tmpdir(), "atelier-codeximg-"));
    const cleanup = () => { try { rmSync(work, { recursive: true, force: true }); } catch {} };

    let inputNote = "";
    if (editImagePath && existsSync(editImagePath)) {
      try {
        copyFileSync(editImagePath, join(work, "input.png"));
        inputNote = " Use input.png in the current working directory as the reference image to edit.";
      } catch {}
    }

    const hint = sizeHint(size);
    // On demande UNIQUEMENT de générer — jamais de sauver/copier (sinon Codex
    // lance un `cp` qui, sans TTY, gèle en attendant une approbation).
    const instruction =
      `Use the image_generation tool exactly once to generate this image: ${String(prompt)}.` +
      (hint ? ` Target resolution ${hint}.` : "") +
      inputNote +
      ` Do NOT write Python, do NOT run any shell commands, do NOT save or copy files — just call the image_generation tool and stop.`;

    // reasoning_effort=low : ~24 s au lieu de plusieurs minutes ; le rendu ne
    // profite pas d'un raisonnement long.
    const args = [
      "exec", "--skip-git-repo-check", "-s", "workspace-write",
      "-c", "model_reasoning_effort=low", "-C", work, instruction,
    ];

    let proc;
    try {
      // stdin fermé : Codex ne peut pas rester bloqué à attendre une entrée.
      proc = spawnImpl(CODEX_BIN, args, { cwd: work, stdio: ["ignore", "pipe", "pipe"] });
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
        // Primaire : le PNG déposé par Codex dans son store depuis le début du run.
        let png = newestCodexImageSince(imagesDir, sinceMs);
        // Replis : si une version de Codex sauve quand même dans son cwd.
        if (!png) {
          const w = join(work, "out.png");
          png = existsSync(w) ? w : newestPng(work);
        }
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
