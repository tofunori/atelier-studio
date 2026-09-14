// Serveur galerie pour les harnais de test (diff_suite, diff_bench, specs
// e2e) : spawne le VRAI backend de l'app, `atelier-gallery-server` (Rust),
// depuis le 2026-09-14 — le serveur Node `gallery/server/main.mjs` qu'ils
// lançaient auparavant a quitté le dépôt (plan 065 phase B, clôture).
//
// Résolution du binaire (dans l'ordre) : `ATELIER_GALLERY_SERVER_BIN=<chemin>`,
// src-tauri/rust-server-dist/, rust/target/release/, rust/target/debug/, sinon
// `cargo build -p atelier-gallery --bin atelier-gallery-server` (debug). Le
// harnais ne saute jamais silencieusement faute de binaire.
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
  if (fromEnv) return (resolved = fromEnv);
  const candidates = [
    path.join(REPO_DIR, "src-tauri", "rust-server-dist", "atelier-gallery-server"),
    path.join(REPO_DIR, "rust", "target", "release", "atelier-gallery-server"),
    path.join(REPO_DIR, "rust", "target", "debug", "atelier-gallery-server"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return (resolved = c);
  const build = spawnSync("cargo", [
    "build", "--manifest-path", path.join(REPO_DIR, "rust", "Cargo.toml"),
    "-p", "atelier-gallery", "--bin", "atelier-gallery-server",
  ], { stdio: "inherit" });
  if (build.status !== 0 || !fs.existsSync(candidates[2])) {
    throw new Error("gallery_server: atelier-gallery-server introuvable et `cargo build` a échoué");
  }
  return (resolved = candidates[2]);
}

/**
 * @param {{root: string, port: number, env?: Record<string,string>, cwd?: string, stdio?: any, watch?: boolean}} opts
 */
export function spawnGalleryServer({ root, port, env = {}, cwd = root, stdio = "ignore", watch = true }) {
  const bin = resolveGalleryServerBin();
  const args = ["--root", root, "--port", String(port)];
  if (!watch) args.push("--no-watch");
  return spawn(bin, args, {
    cwd,
    env: { ...process.env, ATELIER_ASSETS_DIR: ASSETS_DIR, ...env },
    stdio,
  });
}

/** Attend `GET /ping` 200 (ou échoue après `timeoutMs`). */
export async function waitForServer(port, { timeoutMs = 15_000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
