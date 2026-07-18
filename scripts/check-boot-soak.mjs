#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { nearestRank } from "./summarize-boot-metrics.mjs";

const DEFAULTS = {
  file: join(homedir(), "Library/Application Support/atelier-studio/boot-metrics.json"),
  since: null,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  appVersion: null,
  minDays: 3,
  minWarm: 20,
  minCold: 5,
  maxWarmFmpP95: 1_200,
  maxWarmWsP95: 2_500,
  maxColdFmpP95: 2_000,
  maxColdWsP95: 8_000,
};

function percentile(runs, mark, value = 0.95) {
  const values = runs
    .map((run) => run?.marksMs?.[mark])
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  return nearestRank(values, value);
}

function dayAt(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function summarizeSoak(runs, options) {
  const sinceMs = Date.parse(options.since);
  if (!Number.isFinite(sinceMs)) throw new Error("--since doit être une date ISO valide");
  // Seuls les runs datés nativement et complètement convergés prouvent une
  // journée de soak. Les 77 mesures historiques sans date restent utiles à la
  // baseline, mais ne peuvent pas fabriquer rétroactivement des jours.
  const eligible = runs.filter((run) => (
    Number.isFinite(run?.recordedAtUnixMs)
    && run.recordedAtUnixMs >= sinceMs
    && (!options.appVersion || run.appVersion === options.appVersion)
    && Number.isFinite(run?.marksMs?.firstMeaningfulPaint)
    && Number.isFinite(run?.marksMs?.wsReady)
  ));
  const days = [...new Set(eligible.map((run) => dayAt(run.recordedAtUnixMs, options.timeZone)))].sort();
  const warm = eligible.filter((run) => run.flags?.sidecarPath === "lock-reuse");
  const cold = eligible.filter((run) => run.flags?.sidecarPath === "spawn");
  const metrics = {
    warm: {
      n: warm.length,
      fmpP95: percentile(warm, "firstMeaningfulPaint"),
      wsP95: percentile(warm, "wsReady"),
    },
    cold: {
      n: cold.length,
      fmpP95: percentile(cold, "firstMeaningfulPaint"),
      wsP95: percentile(cold, "wsReady"),
    },
  };
  const checks = {
    calendarDays: days.length >= options.minDays,
    warmRuns: warm.length >= options.minWarm,
    coldRuns: cold.length >= options.minCold,
    warmFmpBudget: metrics.warm.fmpP95 != null
      && metrics.warm.fmpP95 <= options.maxWarmFmpP95,
    warmWsBudget: metrics.warm.wsP95 != null
      && metrics.warm.wsP95 <= options.maxWarmWsP95,
    coldFmpBudget: metrics.cold.fmpP95 != null
      && metrics.cold.fmpP95 <= options.maxColdFmpP95,
    coldWsBudget: metrics.cold.wsP95 != null
      && metrics.cold.wsP95 <= options.maxColdWsP95,
  };
  return {
    since: new Date(sinceMs).toISOString(),
    timeZone: options.timeZone,
    appVersion: options.appVersion,
    eligibleRuns: eligible.length,
    calendarDays: days,
    metrics,
    checks,
    pass: Object.values(checks).every(Boolean),
  };
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  const numeric = new Set([
    "minDays", "minWarm", "minCold", "maxWarmFmpP95", "maxWarmWsP95",
    "maxColdFmpP95", "maxColdWsP95",
  ]);
  const mapping = {
    "--file": "file",
    "--since": "since",
    "--time-zone": "timeZone",
    "--app-version": "appVersion",
    "--min-days": "minDays",
    "--min-warm": "minWarm",
    "--min-cold": "minCold",
    "--max-warm-fmp-p95": "maxWarmFmpP95",
    "--max-warm-ws-p95": "maxWarmWsP95",
    "--max-cold-fmp-p95": "maxColdFmpP95",
    "--max-cold-ws-p95": "maxColdWsP95",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = mapping[argv[index]];
    const value = argv[index + 1];
    if (!key || value == null) throw new Error(`argument inconnu ou incomplet: ${argv[index]}`);
    options[key] = numeric.has(key) ? Number(value) : value;
  }
  if (!options.since) throw new Error("--since est obligatoire");
  for (const key of numeric) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`valeur numérique invalide: ${key}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = JSON.parse(await readFile(options.file, "utf8"));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.runs)) {
    throw new Error("boot-metrics.json: schéma v1 attendu");
  }
  const result = summarizeSoak(parsed.runs, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
