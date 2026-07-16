import { describe, expect, it } from "vitest";
import { parseDirectory, parseJobDetail, parseSnapshot, profile } from "./narval.mjs";

describe("narval read-only parsers", () => {
  it("separates active and recent jobs", () => {
    const value = parseSnapshot("narval", "1|fit|RUNNING|1:00|8|cpu|None|/home/u\n__ATELIER_RECENT__\n1|fit|RUNNING|1:00|8|cpu|start|end|/home/u\n2|done|COMPLETED|2:00|4|cpu|start|end|/home/u\n");
    expect(value.active).toHaveLength(1);
    expect(value.recent.map((job) => job.id)).toEqual(["2"]);
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
});
