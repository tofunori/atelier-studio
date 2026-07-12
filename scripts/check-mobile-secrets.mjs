#!/usr/bin/env node
/**
 * Fail if likely secrets appear in mobile/ or docs/mobile/ (plan 034 I).
 * Does not scan binary assets.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROOTS = [join(ROOT, "mobile"), join(ROOT, "docs/mobile")];
const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  "target",
  "gen",
  ".git",
]);
const SKIP_FILE = new Set([
  "SECRETS_POLICY.md",
  "check-mobile-secrets.mjs",
  "secrets.test.ts", // unit tests for redaction
  "secrets.ts", // pattern source itself
]);

const PATTERNS = [
  { name: "env-assignment-secret", re: /(?:ATELIER_TOKEN|API_KEY|SECRET|PASSWORD)\s*=\s*['"][^'"]{8,}/i },
  { name: "github-pat", re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "openai-ish", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  // long hex only if labeled as token= nearby — avoid false positives on hashes in docs
  { name: "token-hex-assign", re: /token["']?\s*[:=]\s*["']?[a-f0-9]{40,}/i },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(p);
    else if (st.isFile()) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const base = file.split("/").pop();
    if (SKIP_FILE.has(base)) continue;
    if (!/\.(ts|tsx|js|mjs|md|json|css|html)$/i.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // allow [redacted] and documentation of patterns without real values
    if (file.endsWith("SECRETS_POLICY.md")) continue;
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(text)) {
        // ignore test fixtures that only mention redacted
        if (text.includes("[redacted]") && name === "token-hex-assign" && !/[a-f0-9]{40}/i.test(text.replace(/\[redacted[^\]]*\]/gi, ""))) {
          continue;
        }
        hits.push({ file: relative(ROOT, file), pattern: name });
      }
    }
  }
}

if (hits.length) {
  console.error("mobile:check-secrets FAILED");
  for (const h of hits) console.error(`  ${h.pattern}: ${h.file}`);
  process.exit(1);
}
console.log("mobile:check-secrets OK");
