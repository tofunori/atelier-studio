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
    render(<NarvalSurface visible onOpenTerminal={openTerminal} />);
    const statusRequest = lastRequest("narvalStatus");
    const snapshotRequest = lastRequest("narvalSnapshot");
    expect(statusRequest).toBeTruthy();
    expect(snapshotRequest).toBeTruthy();
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
        active: [{ id: "65659188", name: "M42a-full", state: "PENDING", elapsed: "00:00", cpus: 16, partition: "cpu", reason: "Priority", workDir: "/home/tofunori/m42a", startedAt: "", endedAt: "" }],
        recent: [], observedAtMs: 2,
      },
    });
    expect(await screen.findAllByText("65659188")).not.toHaveLength(0);
    expect(lastRequest("narvalInspectJob")?.jobId).toBe("65659188");

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
});
