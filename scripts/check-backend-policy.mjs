#!/usr/bin/env node
/**
 * Porte 11 — garde-fous politique backend CHAT (plan 033/047).
 *
 * Depuis le plan 065 phase A (retrait du sidecar chat Node), il n'y a plus
 * qu'un backend chat : Rust (`atelier-studio-server`), sans sélecteur. Ce
 * script vérifie que ce fait reste vrai dans le code — indépendamment du
 * reste du bundle : le repli base de connaissances
 * (`ATELIER_KB_ENGINE=node`, plan 065 phase C, soak en cours) et le backend
 * galerie (`ATELIER_GALLERY_BACKEND=node`, plan 065 phase B, pas commencée)
 * sont des politiques SÉPARÉES avec leur propre calendrier de retrait.
 * `sidecar-dist` (chaîne KB + wrapper `atelier-gallery-tool`) et `node-dist`
 * (runtime Node embarqué, encore utilisé par la galerie Node et par
 * `atelier-gallery-tool`) restent donc légitimement dans tauri.conf.json
 * après la clôture de CE soak — ce script ne les vérifie plus.
 *
 * Toujours :
 *  - src-tauri/src/sidecar.rs ne contient plus BackendKind::Node ni de
 *    lecture de ATELIER_BACKEND, ni de résolution de sidecar/index.mjs
 *    (branche chat Node totalement retirée) ;
 *  - sidecar.rs résout toujours atelier-studio-server (le seul backend) ;
 *  - stage-rust-server dans beforeBuildCommand ;
 *  - resource rust-server-dist présente dans tauri.conf.json.
 *
 * --strict-no-node :
 *  - exige le marqueur signé docs/soak/033-COMPLETE.md (aucun contournement
 *    par variable d'env — ATELIER_SOAK_COMPLETE=1 est ignoré).
 *
 * Exit 0 = ok ; 1 = violation.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict-no-node");
const errors = [];
const warnings = [];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

// 1) Backend chat = Rust seul, branche Node totalement retirée de sidecar.rs
const sidecarRs = read("src-tauri/src/sidecar.rs");
if (/BackendKind::Node/.test(sidecarRs)) {
  errors.push(
    "sidecar.rs: BackendKind::Node encore présent (plan 065 phase A: le backend chat Node doit être retiré)",
  );
}
if (/var\(\s*"ATELIER_BACKEND"\s*\)/.test(sidecarRs)) {
  errors.push(
    "sidecar.rs: lecture de la variable ATELIER_BACKEND encore présente (plan 065 phase A: à retirer)",
  );
}
if (/sidecar\/index\.mjs|resolve_script\s*\(/.test(sidecarRs)) {
  errors.push(
    "sidecar.rs: résolution de sidecar/index.mjs (chat Node) encore présente",
  );
}
if (!/atelier-studio-server/.test(sidecarRs) || !/resolve_rust_server/.test(sidecarRs)) {
  errors.push(
    "sidecar.rs: résolution atelier-studio-server absente — le backend chat Rust doit rester câblé",
  );
}

// 2) tauri.conf stage + resources (backend chat Rust)
const conf = read("src-tauri/tauri.conf.json");
const confJson = JSON.parse(conf);
const before = confJson?.build?.beforeBuildCommand ?? "";
if (!before.includes("stage-rust-server.sh")) {
  errors.push("tauri.conf.json: beforeBuildCommand sans stage-rust-server.sh");
}
const resources = confJson?.bundle?.resources ?? {};
if (!resources["rust-server-dist"] && !Object.values(resources).includes("rust-server")) {
  errors.push("tauri.conf.json: resource rust-server-dist absente");
}

// 3) stage script exists
if (!existsSync(resolve(root, "scripts/stage-rust-server.sh"))) {
  errors.push("scripts/stage-rust-server.sh manquant");
}

// 4) Marqueur de soak chat (plan 033/047) — seul contrat accepté par
//    --strict-no-node (pas de bypass env production).
//    Contrat : docs/soak/033-COMPLETE.md — voir docs/SOAK_033_RUST_BACKEND.md
const soakCompletePath = resolve(root, "docs/soak/033-COMPLETE.md");
const soakComplete = existsSync(soakCompletePath);
if (process.env.ATELIER_SOAK_COMPLETE === "1") {
  warnings.push(
    "ATELIER_SOAK_COMPLETE=1 est ignoré (seul docs/soak/033-COMPLETE.md compte)",
  );
}
if (!soakComplete) {
  warnings.push(
    "soak chat non marqué COMPLETE (docs/soak/033-COMPLETE.md absent)",
  );
  if (strict) {
    errors.push(
      "--strict-no-node refusé tant que docs/soak/033-COMPLETE.md n'existe pas",
    );
  }
}

// Report
for (const w of warnings) console.warn("WARN:", w);
if (errors.length) {
  for (const e of errors) console.error("ERROR:", e);
  console.error(
    `\nbackend-policy: FAIL (${errors.length} error(s)) soakComplete=${soakComplete} strict=${strict}`,
  );
  process.exit(1);
}
console.log(
  `backend-policy: OK (soakComplete=${soakComplete} strict=${strict} warnings=${warnings.length})`,
);
