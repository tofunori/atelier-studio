// Serveur galerie pour les harnais de test (diff_suite, diff_bench, specs
// e2e) : spawne le VRAI backend de l'app, `atelier-gallery-server` (Rust),
// depuis le 2026-09-14 — le serveur Node `gallery/server/main.mjs` qu'ils
// lançaient auparavant a quitté le dépôt (plan 065 phase B, clôture).
//
// Résolution du binaire : `ATELIER_GALLERY_SERVER_BIN=<chemin>` (doit
// exister), sinon le PLUS RÉCENT (mtime) parmi rust/target/debug/,
// rust/target/release/ et src-tauri/rust-server-dist/ — le dist (stagé,
// non suivi) peut être périmé par rapport à la source, un `cargo build`
// frais doit gagner —, sinon `cargo build -p atelier-gallery --bin
// atelier-gallery-server` (debug). Le harnais ne saute jamais silencieusement
// faute de binaire.
//
// Contrat identique à ce que l'app passe au serveur : `--root <projet>`,
// `--port <n>` et `ATELIER_ASSETS_DIR=gallery/assets` (coquille live +
// éditeurs servis depuis le dépôt, jamais depuis le dossier du projet). Le
// watcher fs reste ACTIF par défaut : les specs de rechargement externe
// (diff, editor_cm6, reading_view) écrivent sur disque et attendent que le
// serveur bumpe sa révision — `watch: false` pour les harnais qui n'en ont
// pas besoin. Les variables passées par l'appelant (`ATELIER_STUDIO`,
// `GALLERY_NO_THUMBS`, …) sont conservées.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GALLERY_DIR = path.resolve(HERE, "..");
export const REPO_DIR = path.resolve(GALLERY_DIR, "..");
export const ASSETS_DIR = path.join(GALLERY_DIR, "assets");

let resolved = "";

export function resolveGalleryServerBin() {
  if (resolved) return resolved;
  const fromEnv = process.env.ATELIER_GALLERY_SERVER_BIN || "";
  if (fromEnv) {
    if (!fs.existsSync(fromEnv)) throw new Error(`gallery_server: ATELIER_GALLERY_SERVER_BIN introuvable : ${fromEnv}`);
    return (resolved = fromEnv);
  }
  const debugBin = path.join(REPO_DIR, "rust", "target", "debug", "atelier-gallery-server");
  const candidates = [
    debugBin,
    path.join(REPO_DIR, "rust", "target", "release", "atelier-gallery-server"),
    path.join(REPO_DIR, "src-tauri", "rust-server-dist", "atelier-gallery-server"),
  ];
  const newest = candidates
    .filter((c) => fs.existsSync(c))
    .map((c) => ({ c, mtime: fs.statSync(c).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (newest) return (resolved = newest.c);
  const build = spawnSync("cargo", [
    "build", "--manifest-path", path.join(REPO_DIR, "rust", "Cargo.toml"),
    "-p", "atelier-gallery", "--bin", "atelier-gallery-server",
  ], { stdio: "inherit" });
  if (build.status !== 0 || !fs.existsSync(debugBin)) {
    throw new Error("gallery_server: atelier-gallery-server introuvable et `cargo build` a échoué");
  }
  return (resolved = debugBin);
}

/**
 * @param {{root: string, port: number, env?: Record<string,string>, cwd?: string, stdio?: any, watch?: boolean}} opts
 */
export function spawnGalleryServer({ root, port, env = {}, cwd = root, stdio = "ignore", watch = true }) {
  const bin = resolveGalleryServerBin();
  const args = ["--root", root, "--port", String(port)];
  if (!watch) args.push("--no-watch");
  const child = spawn(bin, args, {
    cwd,
    env: { ...process.env, ATELIER_ASSETS_DIR: ASSETS_DIR, ...env },
    stdio,
  });
  // Un binaire non exécutable / absent émet `error` de façon asynchrone : sans
  // écouteur, Node lève une exception brute hors de tout test. On la garde
  // pour que waitForServer échoue avec un message lisible.
  child.__spawnError = null;
  child.on("error", (e) => { child.__spawnError = e; });
  return child;
}

/** Attend `GET /ping` 200 — échoue tout de suite si le serveur est mort, sinon après `timeoutMs`. */
export async function waitForServer(port, { timeoutMs = 15_000, intervalMs = 100, child = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.__spawnError) throw new Error(`gallery_server: spawn impossible — ${child.__spawnError.message}`);
    if (child && child.exitCode !== null) throw new Error(`gallery_server: le serveur s'est arrêté (code ${child.exitCode}) avant d'écouter sur ${port}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/ping`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`gallery_server: le serveur n'écoute pas sur ${port} après ${timeoutMs} ms`);
}

/**
 * Sert une page HÔTE de test à `http://127.0.0.1:<port>/host.html` sans
 * l'écrire dans le projet : un HTML arbitraire déposé à la racine du projet
 * est servi par atelier-gallery-server sous `Content-Security-Policy:
 * sandbox` (origine opaque, héritée par ses iframes → la galerie embarquée
 * ne peut plus joindre `/data`). La page hôte est donc fournie par Playwright
 * (`page.route`), à la même origine que le serveur — exactement ce que le
 * serveur Node servait avant, sans le bac à sable.
 */
export async function serveHostPage(page, port, html) {
  const url = `http://127.0.0.1:${port}/host.html`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  return url;
}

/** Port TCP libre sur 127.0.0.1 (ouvre/ferme un serveur éphémère). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Arrête proprement un serveur spawné (SIGTERM, puis SIGKILL après `graceMs`). */
export async function stopGalleryServer(child, { graceMs = 1000 } = {}) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, graceMs)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
