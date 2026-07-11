#!/usr/bin/env node
/**
 * Porte 11 — garde-fous politique backend chat.
 *
 * Toujours :
 *  - défaut Tauri = Rust (parse_backend_kind empty → Rust)
 *  - stage-rust-server dans beforeBuildCommand
 *  - resource rust-server-dist présente dans tauri.conf
 *
 * --strict-no-node (après soak COMPLETE uniquement) :
 *  - refuse resources sidecar/node-runtime pour le chat
 *  - refuse ATELIER_BACKEND=node dans sidecar.rs
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

// 1) Default backend rust
const sidecarRs = read("src-tauri/src/sidecar.rs");
if (!/Default \*\*Rust\*\*|default.*Rust|BackendKind::Rust/.test(sidecarRs)) {
  errors.push("sidecar.rs ne documente/implémente plus le défaut Rust");
}
// parse_backend_kind: only "node" → Node, else Rust
if (!/_ => BackendKind::Rust/.test(sidecarRs) && !/BackendKind::Rust,\s*$/m.test(sidecarRs)) {
  // softer: require match arm for node and default rust
  if (!/\"node\" => BackendKind::Node/.test(sidecarRs)) {
    errors.push("sidecar.rs: branche ATELIER_BACKEND=node absente");
  }
}
if (!/\"node\" => BackendKind::Node/.test(sidecarRs)) {
  errors.push("sidecar.rs: parse_backend_kind doit mapper \"node\" → Node");
}
// Ensure empty default is not Node
if (/unwrap_or\(BackendKind::Node\)|unwrap_or_default\(\).*Node/.test(sidecarRs)) {
  errors.push("sidecar.rs: défaut ne doit pas être Node");
}
// Unit test presence
if (!/default_backend_is_rust/.test(sidecarRs)) {
  warnings.push("test default_backend_is_rust manquant dans sidecar.rs");
}

// 2) tauri.conf stage + resources
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

// 4) Soak not complete → Node fallback must still exist
const soakComplete =
  existsSync(resolve(root, "docs/soak/033-COMPLETE.md")) ||
  process.env.ATELIER_SOAK_COMPLETE === "1";

if (!soakComplete) {
  if (!before.includes("stage-sidecar.sh")) {
    warnings.push(
      "soak non COMPLETE: stage-sidecar.sh absent du build (fallback Node cassé ?)",
    );
  }
  if (!resources["sidecar-dist"]) {
    warnings.push("soak non COMPLETE: resource sidecar-dist absente");
  }
  if (strict) {
    errors.push(
      "--strict-no-node refusé tant que docs/soak/033-COMPLETE.md n'existe pas",
    );
  }
} else if (strict) {
  // After soak: Node chat must not be production-default nor required.
  if (/\"node\" => BackendKind::Node/.test(sidecarRs) && /ATELIER_BACKEND/.test(sidecarRs)) {
    // still allow code path for emergency? Plan says remove ATELIER_BACKEND=node
    errors.push(
      "strict: retirer le fallback ATELIER_BACKEND=node de sidecar.rs après soak",
    );
  }
  if (resources["sidecar-dist"] || resources["node-dist"]) {
    errors.push(
      "strict: resources sidecar/node-runtime encore dans tauri.conf (chat Node embarqué)",
    );
  }
  if (before.includes("stage-sidecar.sh") || before.includes("stage-node-runtime.sh")) {
    errors.push("strict: beforeBuildCommand stage encore le chat Node");
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
