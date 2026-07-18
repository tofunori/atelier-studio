import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));

import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import {
  getBootMetricsSnapshot,
  markBootMetric,
  persistBootMetrics,
  resetBootMetricsForTests,
  setBootMetricFlags,
  startBootMetrics,
} from "./bootMetrics";

const invokeMock = vi.mocked(invoke);
const getVersionMock = vi.mocked(getVersion);

describe("bootMetrics", () => {
  let now = 10;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 10;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
      if (command === "boot_clock_elapsed_ms") return 120;
      return undefined;
    });
    getVersionMock.mockReset();
    getVersionMock.mockResolvedValue("1.3.1");
    resetBootMetricsForTests();
  });

  afterEach(() => {
    resetBootMetricsForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("produit des marques monotones et idempotentes depuis l'horloge native", async () => {
    now = 12;
    await startBootMetrics();
    now = 20;
    markBootMetric("uiStateHydrated");
    now = 26;
    markBootMetric("reactCommitted");
    now = 40;
    markBootMetric("firstMeaningfulPaint");
    now = 99;
    markBootMetric("reactCommitted");

    const snapshot = getBootMetricsSnapshot();
    expect(snapshot?.appVersion).toBe("1.3.1");
    expect(snapshot?.marksMs.frontendEvaluated).toBe(
      snapshot?.nativeProcessElapsedAtFrontendEvalMs,
    );
    expect(snapshot?.marksMs.uiStateHydrated).toBeLessThan(
      snapshot?.marksMs.reactCommitted ?? 0,
    );
    expect(snapshot?.marksMs.reactCommitted).toBeLessThan(
      snapshot?.marksMs.firstMeaningfulPaint ?? 0,
    );
    expect(snapshot?.marksMs.reactCommitted).toBe(
      (snapshot?.nativeProcessElapsedAtFrontendEvalMs ?? 0) + 16,
    );
  });

  it("n'enregistre que le schéma autorisé et les drapeaux diagnostiques", async () => {
    await startBootMetrics();
    setBootMetricFlags({ uiStateSource: "legacy-http", sidecarPath: "lock-reuse" });
    setBootMetricFlags({ sidecarPath: "in-process" });
    markBootMetric("sidecarReady");
    await persistBootMetrics();

    const recordCall = invokeMock.mock.calls.find(([command]) => command === "record_boot_metrics");
    expect(recordCall).toBeTruthy();
    const serialized = JSON.stringify(recordCall?.[1]);
    expect(serialized).toContain("legacy-http");
    expect(serialized).toContain("lock-reuse");
    for (const forbidden of ["token", "port", "projectRoot", "threadId", "prompt", "ui.json"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(window.__ATELIER_BOOT_METRICS__).toEqual(getBootMetricsSnapshot());
  });

  it("conserve le premier chemin sidecar observé avant l'initialisation", async () => {
    setBootMetricFlags({ sidecarPath: "spawn" });
    setBootMetricFlags({ sidecarPath: "in-process" });

    await startBootMetrics();

    expect(getBootMetricsSnapshot()?.flags.sidecarPath).toBe("spawn");
  });
});
