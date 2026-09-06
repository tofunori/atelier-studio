import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import CalculsSurface, { calculsDebug, type ComputeRun } from "./CalculsSurface";

const sent: any[] = [];
let online = true;

vi.mock("../lib/wsBus", () => ({
  wsSend: (message: unknown) => {
    sent.push(message);
    return online;
  },
}));

// La vue Slurm est l'ancienne surface Narval, conservée telle quelle et testée
// à part : ici un stub suffit pour vérifier la bascule.
vi.mock("./NarvalSurface", () => ({
  default: ({ visible }: { visible: boolean }) => <div data-testid="narval-stub" data-visible={visible} />,
}));

function deliver(message: Record<string, unknown>) {
  act(() => window.dispatchEvent(new CustomEvent("compute-message", { detail: message })));
}

function lastRequest(type: string) {
  return [...sent].reverse().find((message) => message.type === type);
}

const NOW = Date.parse("2026-09-06T12:00:00Z");

function run(overrides: Partial<ComputeRun> & { id: string }): ComputeRun {
  return {
    source: "atelier-run",
    host: "mac",
    label: overrides.id,
    command: "python3 scripts/fit.py --model M42",
    workDir: "/Users/tofunori/Documents/albedo",
    state: "completed",
    startedAt: "2026-09-06T10:00:00Z",
    endedAt: "2026-09-06T11:30:00Z",
    lastActivityAt: "2026-09-06T11:30:00Z",
    progress: null,
    logPath: null,
    logTail: ["epoch 9", "done"],
    remoteTasks: [],
    detail: { kind: "local", pid: 4242 },
    ...overrides,
  };
}

const RUNS: ComputeRun[] = [
  run({ id: "mac:old-fit", label: "Ajustement M41", lastActivityAt: "2026-09-05T08:00:00Z", endedAt: "2026-09-05T08:00:00Z" }),
  run({
    id: "nas:docker:gee-export", label: "Export GEE", host: "nas", source: "docker", state: "running", endedAt: null,
    lastActivityAt: "2026-09-06T11:59:30Z", progress: { current: 40, total: 100, unit: "tuiles" },
    detail: { kind: "docker", container: "gee-export" },
  }),
  run({
    id: "narval:slurm:65659188", label: "M42a-full", host: "narval", source: "slurm", state: "queued", endedAt: null,
    startedAt: "", lastActivityAt: "2026-09-06T11:50:00Z", detail: { kind: "slurm", jobId: "65659188", profile: "narval" },
  }),
];

function snapshotMessage(requestId: string, extra: Partial<{ runs: ComputeRun[]; errors: unknown[]; observedAt: string }> = {}) {
  return {
    type: "computeSnapshot",
    requestId,
    data: { observedAt: new Date(NOW).toISOString(), runs: RUNS, errors: [], ...extra },
  };
}

describe("CalculsSurface", () => {
  beforeAll(() => {
    (Element.prototype as Element & { getAnimations: () => Animation[] }).getAnimations = () => [];
  });
  beforeEach(() => {
    sent.splice(0);
    online = true;
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("demande un snapshot 7 jours tous hôtes, rend les runs triés running d'abord", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    expect(request).toBeTruthy();
    expect(request.days).toBe(7);
    expect(request.hosts).toBeUndefined();
    expect(container.querySelector(".calculs-skeleton")).toBeTruthy();

    deliver(snapshotMessage(request.requestId));
    const rows = [...container.querySelectorAll(".calculs-run")];
    expect(rows.map((row) => row.getAttribute("data-run-state"))).toEqual(["running", "queued", "completed"]);
    expect(rows[0].textContent).toContain("Export GEE");
    expect(rows[0].textContent).toContain("NAS · docker");
    expect(rows[0].querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText(/observé il y a 0 s|observed 0 s ago/)).toBeTruthy();
    // pas de terminal pour « Tous » : aucun hôte distant ciblé
    expect(screen.queryByRole("button", { name: /^terminal$/i })).toBeNull();
  });

  it("le filtre d'hôte relance la requête avec hosts:[…] et propose le terminal de l'hôte", () => {
    const openTerminal = vi.fn();
    render(<CalculsSurface visible onOpenTerminal={openTerminal} />);
    fireEvent.click(screen.getByRole("radio", { name: "NAS" }));
    const request = lastRequest("computeSnapshot");
    expect(request.hosts).toEqual(["nas"]);
    expect(localStorage.getItem("atelier.calculs.host")).toBe("nas");
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenCalledWith("ssh nas");

    fireEvent.click(screen.getByRole("radio", { name: "Narval" }));
    expect(lastRequest("computeSnapshot").hosts).toEqual(["narval"]);
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenLastCalledWith("ssh nas -t ssh narval-vpn");
  });

  it("ignore une réponse dont le requestId n'est plus le dernier", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const first = lastRequest("computeSnapshot");
    fireEvent.click(screen.getByRole("button", { name: /actualiser|refresh/i }));
    const second = lastRequest("computeSnapshot");
    expect(second.requestId).not.toBe(first.requestId);
    deliver(snapshotMessage(first.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(0);
    deliver(snapshotMessage(second.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
  });

  it("affiche un bandeau par hôte en erreur tout en gardant la liste", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId, {
      errors: [{ host: "narval", code: "ssh", message: "Connection timed out" }],
    }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
    const alert = container.querySelector(".calculs-alert");
    expect(alert?.textContent).toContain("Narval");
    expect(alert?.textContent).toContain("Connection timed out");
  });

  it("un snapshot identique ne re-rend aucune rangée", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    const request = lastRequest("computeSnapshot");
    deliver(snapshotMessage(request.requestId));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
    const renders = calculsDebug.rowRenders;
    // même contenu, observedAt différent : seule l'étiquette « observé » bouge
    deliver(snapshotMessage(request.requestId, { observedAt: new Date(NOW + 5_000).toISOString() }));
    expect(calculsDebug.rowRenders).toBe(renders);
    // contenu différent : la liste se met à jour
    deliver(snapshotMessage(request.requestId, { runs: RUNS.slice(0, 2) }));
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(2);
  });

  it("signale l'absence de service et les données périmées", () => {
    online = false;
    const { container, unmount } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    expect(container.querySelector(".calculs-offline")).toBeTruthy();
    unmount();

    online = true;
    render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    expect(screen.queryByText(/périmées|stale/)).toBeNull();
    act(() => { vi.advanceTimersByTime(70_000); });
    expect(screen.getByText(/périmées|stale/)).toBeTruthy();
  });

  it("l'onglet Log demande computeReadLog 400 lignes et affiche le journal", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    fireEvent.click(container.querySelectorAll(".calculs-run")[0]);
    expect(container.querySelector(".calculs-surface")?.getAttribute("data-inspector")).toBe("open");
    expect(container.querySelector(".calculs-inspector")?.textContent).toContain("python3 scripts/fit.py");
    expect(lastRequest("computeReadLog")).toBeUndefined();

    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    const logRequest = lastRequest("computeReadLog");
    expect(logRequest).toMatchObject({ runId: "nas:docker:gee-export", tailLines: 400 });
    deliver({
      type: "computeLog", requestId: logRequest.requestId, runId: "nas:docker:gee-export",
      data: { lines: ["tile 39", "tile 40"], truncated: true },
    });
    expect(container.querySelector(".calculs-log-scroll pre")?.textContent).toBe("tile 39\ntile 40");
    expect(screen.getByText(/tronqué|truncated/)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".calculs-surface")?.getAttribute("data-inspector")).toBe("closed");
  });

  it("« Vue Slurm » bascule sur NarvalSurface puis revient", () => {
    const { container } = render(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    deliver(snapshotMessage(lastRequest("computeSnapshot").requestId));
    fireEvent.click(container.querySelectorAll(".calculs-run")[1]);
    fireEvent.click(screen.getByRole("button", { name: /vue slurm|slurm view/i }));
    expect(screen.getByTestId("narval-stub").getAttribute("data-visible")).toBe("true");
    expect(container.querySelector(".calculs-run")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retour aux calculs|back to compute/i }));
    expect(screen.queryByTestId("narval-stub")).toBeNull();
    expect(container.querySelectorAll(".calculs-run")).toHaveLength(3);
  });

  it("ne sonde que lorsque la surface est visible", () => {
    const { rerender } = render(<CalculsSurface visible={false} onOpenTerminal={vi.fn()} />);
    expect(lastRequest("computeSnapshot")).toBeUndefined();
    rerender(<CalculsSurface visible onOpenTerminal={vi.fn()} />);
    expect(lastRequest("computeSnapshot")).toBeTruthy();
    const before = sent.filter((m) => m.type === "computeSnapshot").length;
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(sent.filter((m) => m.type === "computeSnapshot").length).toBe(before + 1);
    rerender(<CalculsSurface visible={false} onOpenTerminal={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(sent.filter((m) => m.type === "computeSnapshot").length).toBe(before + 1);
  });
});
