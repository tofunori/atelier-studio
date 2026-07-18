#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const METRIC_NAMES = [
  "frontendEvaluated",
  "uiStateHydrated",
  "reactCommitted",
  "firstMeaningfulPaint",
  "sidecarReady",
  "wsReady",
  "galleryReady",
];

export function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

export function summarizeRuns(runs) {
  const summary = {};
  for (const name of METRIC_NAMES) {
    const values = runs
      .map((run) => run?.marksMs?.[name])
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (values.length === 0) continue;
    summary[name] = {
      n: values.length,
      min: Math.min(...values),
      p50: nearestRank(values, 0.5),
      p95: nearestRank(values, 0.95),
      max: Math.max(...values),
    };
  }
  return summary;
}

function parseArgs(argv) {
  const opts = {
    file: join(homedir(), "Library/Application Support/atelier-studio/boot-metrics.json"),
    appVersion: null,
    sidecarPath: null,
    uiStateSource: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--file" && value) opts.file = value;
    if (argv[index] === "--app-version" && value) opts.appVersion = value;
    if (argv[index] === "--sidecar-path" && value) opts.sidecarPath = value;
    if (argv[index] === "--ui-state-source" && value) opts.uiStateSource = value;
    if (argv[index].startsWith("--")) index += 1;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(await readFile(opts.file, "utf8"));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.runs)) {
    throw new Error("boot-metrics.json: schéma v1 attendu");
  }
  const runs = parsed.runs.filter((run) => (
    (!opts.appVersion || run.appVersion === opts.appVersion)
    && (!opts.sidecarPath || run.flags?.sidecarPath === opts.sidecarPath)
    && (!opts.uiStateSource || run.flags?.uiStateSource === opts.uiStateSource)
  ));
  process.stdout.write(`${JSON.stringify({ filters: opts, runs: runs.length, metrics: summarizeRuns(runs) }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
