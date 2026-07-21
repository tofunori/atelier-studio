import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import NarvalSurface from "./NarvalSurface";

const sent: any[] = [];

vi.mock("../lib/wsBus", () => ({
  wsSend: (message: unknown) => {
    sent.push(message);
    return true;
  },
}));

function deliver(message: Record<string, unknown>) {
  act(() => window.dispatchEvent(new CustomEvent("narval-message", { detail: message })));
}

function lastRequest(type: string) {
  return [...sent].reverse().find((message) => message.type === type);
}

describe("NarvalSurface", () => {
  beforeAll(() => {
    (Element.prototype as Element & { getAnimations: () => Animation[] }).getAnimations = () => [];
  });
  beforeEach(() => sent.splice(0));
  afterEach(() => cleanup());

  it("loads status, jobs, and inspects the first active Slurm job", async () => {
    const openTerminal = vi.fn();
    const { container } = render(<NarvalSurface visible onOpenTerminal={openTerminal} />);
    const statusRequest = lastRequest("narvalStatus");
    const snapshotRequest = lastRequest("narvalSnapshot");
    expect(statusRequest).toBeTruthy();
    expect(snapshotRequest).toBeTruthy();
    expect(snapshotRequest.days).toBe(30);
    const filesToggle = screen.getByRole("button", { name: /masquer l.explorateur|hide file explorer/i });
    fireEvent.click(filesToggle);
    expect(container.querySelector(".narval-surface")?.getAttribute("data-files-open")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /afficher l.explorateur|show file explorer/i }));
    expect(container.querySelector(".narval-surface")?.getAttribute("data-files-open")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenCalledWith("ssh nas -t ssh narval-vpn");
    openTerminal.mockClear();

    deliver({
      type: "narvalStatus",
      requestId: statusRequest.requestId,
      data: { profile: "narval", host: "narval-vpn", gateway: "nas", home: "/home/tofunori", roots: ["/home", "/project", "/scratch"], connected: true, slurmAvailable: true, observedAtMs: 1 },
    });
    expect(lastRequest("narvalListDirectory")?.path).toBe("/home/tofunori");
    fireEvent.click(screen.getByRole("button", { name: /^terminal$/i }));
    expect(openTerminal).toHaveBeenCalledWith("ssh nas -t ssh narval-vpn");

    deliver({
      type: "narvalSnapshot",
      requestId: snapshotRequest.requestId,
      data: {
        active: [{ id: "65659188", name: "M42a-full-with-a-name-that-must-never-overlap-metrics", state: "PENDING", elapsed: "00:00", cpus: 16, partition: "cpu", reason: "Priority", workDir: "/home/tofunori/m42a", startedAt: "", endedAt: "" }],
        recent: [], observedAtMs: 2,
      },
    });
    expect(await screen.findAllByText("65659188")).not.toHaveLength(0);
    expect(screen.getByTitle("M42a-full-with-a-name-that-must-never-overlap-metrics")).toBeTruthy();
    expect(lastRequest("narvalInspectJob")?.jobId).toBe("65659188");
    expect(lastRequest("narvalRunFiles")?.jobId).toBe("65659188");

    const detailRequest = lastRequest("narvalInspectJob");
    deliver({
      type: "narvalJobDetail",
      requestId: detailRequest.requestId,
      data: {
        job: { id: "65659188", name: "M42a-full", state: "PENDING", elapsed: "00:00", cpus: 16, partition: "cpu", reason: "", workDir: "/home/tofunori/m42a", startedAt: "", endedAt: "" },
        requestedMemory: "64G", submittedAt: "2026-07-15T11:41", stdoutPath: "slurm-65659188.out", stderrPath: "slurm-65659188.err",
      },
    });
    expect(lastRequest("narvalReadText")?.path).toBe("/home/tofunori/m42a/slurm-65659188.out");

    const runFilesRequest = lastRequest("narvalRunFiles");
    deliver({
      type: "narvalRunFiles",
      requestId: runFilesRequest.requestId,
      data: {
        jobId: "65659188",
        workDir: "/home/tofunori/m42a",
        roots: [{ path: "/home/tofunori/m42a/model_outputs", source: "declared" }],
        entries: [{ name: "fit_summary.json", path: "/home/tofunori/m42a/model_outputs/fit_summary.json", size: 128, modifiedAt: 1, attribution: "probable" }],
        truncated: false,
        observedAtMs: 3,
      },
    });
    fireEvent.click(screen.getByRole("tab", { name: /fichiers|files/i }));
    expect(screen.getByText("fit_summary.json")).toBeTruthy();
    expect(screen.getByText(/probables?|probable/i)).toBeTruthy();
  });

  it("ignores an obsolete snapshot response after refresh", () => {
    render(<NarvalSurface visible onOpenTerminal={() => {}} />);
    const oldRequest = lastRequest("narvalSnapshot");
    deliver({ type: "narvalSnapshot", requestId: oldRequest.requestId, data: { active: [], recent: [], observedAtMs: 1 } });
    fireEvent.click(screen.getByRole("button", { name: /actualiser|refresh/i }));
    const currentRequest = lastRequest("narvalSnapshot");
    expect(currentRequest.requestId).not.toBe(oldRequest.requestId);

    deliver({ type: "narvalSnapshot", requestId: oldRequest.requestId, data: { active: [{ id: "111", name: "stale", state: "RUNNING", elapsed: "", cpus: 1, partition: "", reason: "", workDir: "", startedAt: "", endedAt: "" }], recent: [] } });
    expect(screen.queryByText("stale")).toBeNull();

    deliver({ type: "narvalSnapshot", requestId: currentRequest.requestId, data: { active: [{ id: "222", name: "current", state: "RUNNING", elapsed: "", cpus: 1, partition: "", reason: "", workDir: "", startedAt: "", endedAt: "" }], recent: [] } });
    expect(screen.getAllByText("current").length).toBeGreaterThan(0);
  });

  it("sorts recent runs newest first, filters them, and reveals more by batches", () => {
    const { container } = render(<NarvalSurface visible onOpenTerminal={() => {}} />);
    const snapshotRequest = lastRequest("narvalSnapshot");
    const recent = Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return {
        id: String(7000 + index),
        name: `run-${day}`,
        state: index === 28 ? "FAILED" : "COMPLETED",
        elapsed: "1:00",
        cpus: 4,
        partition: "cpu",
        reason: "",
        workDir: `/scratch/run-${day}`,
        startedAt: `2026-07-${day}T09:00:00`,
        endedAt: `2026-07-${day}T10:00:00`,
      };
    });
    deliver({ type: "narvalSnapshot", requestId: snapshotRequest.requestId, data: { active: [], recent, observedAtMs: 2 } });

    const rows = container.querySelectorAll(".narval-run");
    expect(rows).toHaveLength(25);
    expect(rows[0]?.textContent).toContain("run-30");
    fireEvent.click(screen.getByRole("button", { name: /afficher plus|show more/i }));
    expect(container.querySelectorAll(".narval-run")).toHaveLength(30);

    fireEvent.click(screen.getByRole("radio", { name: /échecs|failed/i }));
    expect(container.querySelectorAll(".narval-run")).toHaveLength(1);
    expect(container.querySelector(".narval-run")?.textContent).toContain("run-29");

    fireEvent.change(screen.getByRole("textbox", { name: /rechercher un nom|search by name/i }), { target: { value: "7028" } });
    expect(container.querySelector(".narval-run")?.textContent).toContain("7028");
  });
});
