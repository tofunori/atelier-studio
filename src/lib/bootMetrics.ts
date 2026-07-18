import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

export type BootMetricName =
  | "frontendEvaluated"
  | "uiStateHydrated"
  | "reactCommitted"
  | "firstMeaningfulPaint"
  | "sidecarReady"
  | "wsReady"
  | "galleryReady";

export type BootMetricsV1 = {
  schemaVersion: 1;
  appVersion: string;
  bootId: string;
  nativeProcessElapsedAtFrontendEvalMs: number;
  marksMs: Partial<Record<BootMetricName, number>>;
  flags: {
    uiStateSource: "native" | "localStorage-fallback" | "legacy-http";
    sidecarPath: "in-process" | "lock-reuse" | "spawn" | "unknown";
    gatewayDeferred: boolean;
  };
};

declare global {
  interface Window {
    __ATELIER_BOOT_METRICS__?: BootMetricsV1;
  }
}

type PendingMark = { name: BootMetricName; at: number };

let frontendEvaluatedAt = performance.now();
let pendingMarks: PendingMark[] = [{ name: "frontendEvaluated", at: frontendEvaluatedAt }];
let pendingFlags: Partial<BootMetricsV1["flags"]> = {};
let metrics: BootMetricsV1 | null = null;
let initialization: Promise<BootMetricsV1> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function newBootId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `boot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function exposeSnapshot(): void {
  if (!metrics) return;
  window.__ATELIER_BOOT_METRICS__ = structuredClone(metrics);
}

function elapsedAt(performanceMark: number): number {
  if (!metrics) return 0;
  return Math.max(
    metrics.nativeProcessElapsedAtFrontendEvalMs,
    metrics.nativeProcessElapsedAtFrontendEvalMs + performanceMark - frontendEvaluatedAt,
  );
}

function applyMark(mark: PendingMark): void {
  if (!metrics || metrics.marksMs[mark.name] != null) return;
  metrics.marksMs[mark.name] = elapsedAt(mark.at);
}

function schedulePersist(): void {
  if (!metrics || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistBootMetrics();
  }, 50);
}

function mergeFlags(
  current: Partial<BootMetricsV1["flags"]>,
  incoming: Partial<BootMetricsV1["flags"]>,
): Partial<BootMetricsV1["flags"]> {
  const merged = { ...current, ...incoming };
  if (
    current.sidecarPath != null
    && current.sidecarPath !== "unknown"
    && incoming.sidecarPath != null
  ) {
    merged.sidecarPath = current.sidecarPath;
  }
  return merged;
}

export function startBootMetrics(): Promise<BootMetricsV1> {
  if (initialization) return initialization;
  const invokeStartedAt = performance.now();
  initialization = Promise.all([
    invoke<number>("boot_clock_elapsed_ms"),
    getVersion().catch(() => "unknown"),
  ]).then(([nativeElapsedAtResponse, appVersion]) => {
    const responseAt = performance.now();
    const nativeAtFrontendEvaluation = Math.max(
      0,
      nativeElapsedAtResponse - (responseAt - invokeStartedAt) - (invokeStartedAt - frontendEvaluatedAt),
    );
    metrics = {
      schemaVersion: 1,
      appVersion,
      bootId: newBootId(),
      nativeProcessElapsedAtFrontendEvalMs: nativeAtFrontendEvaluation,
      marksMs: {},
      flags: {
        uiStateSource: "localStorage-fallback",
        sidecarPath: "unknown",
        gatewayDeferred: false,
        ...pendingFlags,
      },
    };
    for (const mark of pendingMarks) applyMark(mark);
    pendingMarks = [];
    pendingFlags = {};
    exposeSnapshot();
    schedulePersist();
    return metrics;
  }).catch((error) => {
    initialization = null;
    console.warn("Atelier: métriques de démarrage indisponibles:", error);
    throw error;
  });
  return initialization;
}

export function markBootMetric(name: BootMetricName): void {
  if (metrics?.marksMs[name] != null || pendingMarks.some((mark) => mark.name === name)) return;
  const mark = { name, at: performance.now() };
  if (!metrics) {
    pendingMarks.push(mark);
    return;
  }
  applyMark(mark);
  exposeSnapshot();
  schedulePersist();
}

export function setBootMetricFlags(flags: Partial<BootMetricsV1["flags"]>): void {
  if (!metrics) {
    pendingFlags = mergeFlags(pendingFlags, flags);
    return;
  }
  metrics.flags = mergeFlags(metrics.flags, flags) as BootMetricsV1["flags"];
  exposeSnapshot();
  schedulePersist();
}

export function getBootMetricsSnapshot(): BootMetricsV1 | null {
  return metrics ? structuredClone(metrics) : null;
}

export async function persistBootMetrics(): Promise<void> {
  if (!metrics) return;
  await invoke("record_boot_metrics", { payload: structuredClone(metrics) });
}

/** Réservé aux tests : réinitialise le singleton et les timers. */
export function resetBootMetricsForTests(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  frontendEvaluatedAt = performance.now();
  pendingMarks = [{ name: "frontendEvaluated", at: frontendEvaluatedAt }];
  pendingFlags = {};
  metrics = null;
  initialization = null;
  delete window.__ATELIER_BOOT_METRICS__;
}
