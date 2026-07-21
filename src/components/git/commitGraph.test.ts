import { describe, expect, it } from "vitest";
import { buildCommitGraph } from "./commitGraph";
import type { GitCommitSummary } from "./types";

function commit(sha: string, parents: string[]): GitCommitSummary {
  return {
    sha, shortSha: sha.slice(0, 7), parents, author: "Tester", authorEmail: "t@example.com",
    authoredAt: "2026-07-20T12:00:00Z", subject: sha, decorations: [],
  };
}

describe("buildCommitGraph", () => {
  it("conserve les lanes d’une branche et les reconnecte après un merge", () => {
    const rows = buildCommitGraph([
      commit("merge", ["main", "topic"]),
      commit("main", ["base"]),
      commit("topic", ["base"]),
      commit("base", []),
    ]);

    expect(rows[0]).toMatchObject({ lane: 0, laneCount: 2, introduced: true });
    expect(rows[0].parents).toEqual([{ from: 0, to: 0 }, { from: 0, to: 1 }]);
    expect(rows[1].continuations).toContainEqual({ from: 1, to: 1 });
    expect(rows[2].parents).toEqual([{ from: 1, to: 0 }]);
    expect(rows[3]).toMatchObject({ lane: 0, laneCount: 1 });
  });
});
