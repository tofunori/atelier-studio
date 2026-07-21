import { describe, expect, it } from "vitest";
import { extractRunRoots, parseDirectory, parseJobDetail, parseRunFileRecords, parseRunManifest, parseSnapshot, profile } from "./narval.mjs";

describe("narval read-only parsers", () => {
  it("separates active and recent jobs", () => {
    const value = parseSnapshot("narval", "1|fit|RUNNING|1:00|8|cpu|None|/home/u\n__ATELIER_RECENT__\n1|fit|RUNNING|1:00|8|cpu|2026-07-21T10:00|2026-07-21T11:00|/home/u\n2|older|COMPLETED|2:00|4|cpu|2026-07-19T10:00|2026-07-19T12:00|/home/u\n3|newer|FAILED|2:00|4|cpu|2026-07-20T10:00|2026-07-20T12:00|/home/u\n");
    expect(value.active).toHaveLength(1);
    expect(value.recent.map((job) => job.id)).toEqual(["3", "2"]);
  });

  it("sorts directories first", () => {
    const entries = parseDirectory("/home/u", "a.txt\x1ff\x1f1\x1f2\nproject\x1fd\x1f0\x1f3\n");
    expect(entries[0]).toMatchObject({ name: "project", kind: "directory" });
  });

  it("parses Slurm details", () => {
    const detail = parseJobDetail("42|fit|PENDING|0:00|16|64G|cpu|submit|start|end|/home/u|slurm-%j.out|slurm-%A.err\n");
    expect(detail?.job.id).toBe("42");
    expect(detail?.requestedMemory).toBe("64G");
    expect(detail?.stdoutPath).toBe("slurm-42.out");
    expect(detail?.stderrPath).toBe("slurm-42.err");
  });

  it("rejects unknown profiles before executing ssh", () => {
    expect(() => profile("other")).toThrow(/inconnu/);
  });

  it("prefers output directories declared by the run log", () => {
    expect(extractRunRoots("[env] run_root=/home/u/run\n[run] response=a out=/home/u/run/model_outputs/a\n"))
      .toEqual([{ path: "/home/u/run/model_outputs/a", source: "declared" }]);
  });

  it("parses manifest outputs and preserves file attribution", () => {
    expect(parseRunManifest('{"outputs":["fit.csv",{"path":"/home/u/run/figure.png"}]}', "/home/u/run"))
      .toEqual(["/home/u/run/fit.csv", "/home/u/run/figure.png"]);
    expect(parseRunFileRecords("/home/u/run/fit.csv\x1f42\x1f123.5\n", "confirmed")[0])
      .toMatchObject({ name: "fit.csv", size: 42, attribution: "confirmed" });
  });
});
