/**
 * Export deterministic transcripts to packages/atelier-protocol/fixtures/*.json
 * for Rust + Node contract tests (plan 034 jalon B).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Load TS sources via vitest-less dynamic: reimplement export using built helpers
// by spawning node --experimental-strip-types on a tiny loader.
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const fixturesDir = join(root, "fixtures");
mkdirSync(fixturesDir, { recursive: true });

const { spawnSync } = await import("node:child_process");
const loader = `
import { writeFileSync } from "node:fs";
import {
  smallTranscript,
  mediumTranscript,
  interactionPendingTranscript,
  errorTranscript,
  interruptTranscript,
} from "./src/transcripts/build.ts";

const bundles = [
  smallTranscript(),
  mediumTranscript(),
  interactionPendingTranscript(),
  errorTranscript(),
  interruptTranscript(),
];
for (const b of bundles) {
  const path = new URL("./fixtures/" + b.id + "-transcript.json", import.meta.url);
  // fix: write relative
}
`;

// Direct strip-types runner
const code = `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  smallTranscript,
  mediumTranscript,
  interactionPendingTranscript,
  errorTranscript,
  interruptTranscript,
} from ${JSON.stringify(join(root, "src/transcripts/build.ts"))};

const dir = ${JSON.stringify(fixturesDir)};
for (const b of [
  smallTranscript(),
  mediumTranscript(),
  interactionPendingTranscript(),
  errorTranscript(),
  interruptTranscript(),
]) {
  const file = join(dir, b.id + "-transcript.json");
  writeFileSync(file, JSON.stringify(b, null, 2) + "\\n");
  console.log("wrote", file, "events=", b.events.length, "lastSequence=", b.lastSequence);
}
`;

const r = spawnSync(process.execPath, ["--experimental-strip-types", "-e", code], {
  encoding: "utf8",
  cwd: root,
});
if (r.status !== 0) {
  console.error(r.stdout, r.stderr);
  process.exit(r.status ?? 1);
}
console.log(r.stdout);
