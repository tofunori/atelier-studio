import type { GitCommitSummary } from "./types";

type GraphConnection = { from: number; to: number };

export type CommitGraphRow = {
  lane: number;
  laneCount: number;
  introduced: boolean;
  continuations: GraphConnection[];
  parents: GraphConnection[];
};

/** Builds stable graph lanes from Git's topological commit order. */
export function buildCommitGraph(commits: GitCommitSummary[]): CommitGraphRow[] {
  let active: string[] = [];
  return commits.map((commit) => {
    const top = [...active];
    let lane = top.indexOf(commit.sha);
    const introduced = lane < 0;
    const working = [...top];
    if (introduced) {
      lane = working.length;
      working.push(commit.sha);
    }

    const bottom = working.filter((_, index) => index !== lane);
    let insertion = Math.min(lane, bottom.length);
    for (const parent of commit.parents) {
      if (!bottom.includes(parent)) bottom.splice(insertion++, 0, parent);
    }

    const continuations = top.flatMap((sha, from) => {
      if (sha === commit.sha) return [];
      const to = bottom.indexOf(sha);
      return to < 0 ? [] : [{ from, to }];
    });
    const parents = commit.parents.flatMap((sha) => {
      const to = bottom.indexOf(sha);
      return to < 0 ? [] : [{ from: lane, to }];
    });
    const laneCount = Math.max(1, top.length, bottom.length, lane + 1);
    active = bottom;
    return { lane, laneCount, introduced, continuations, parents };
  });
}

const GRAPH_COLORS = [
  "var(--accent)",
  "var(--info)",
  "var(--status-warning)",
  "var(--status-success)",
  "var(--status-error)",
];

function x(lane: number) { return 8 + lane * 14; }
function color(lane: number) { return GRAPH_COLORS[lane % GRAPH_COLORS.length]; }
function curve(from: number, to: number, start: number, end: number) {
  const middle = (start + end) / 2;
  return `M ${x(from)} ${start} C ${x(from)} ${middle}, ${x(to)} ${middle}, ${x(to)} ${end}`;
}

export function CommitGraph({ row, merge }: { row: CommitGraphRow; merge: boolean }) {
  const width = x(row.laneCount - 1) + 8;
  return (
    <svg
      className="git-commit-graph"
      width={width}
      height="52"
      viewBox={`0 0 ${width} 52`}
      aria-hidden="true"
      data-lane={row.lane}
      data-lanes={row.laneCount}
      data-merge={merge || undefined}
    >
      {row.continuations.map((connection, index) => (
        <path key={`c-${index}`} d={curve(connection.from, connection.to, 0, 52)} stroke={color(connection.from)} />
      ))}
      {!row.introduced && <path d={`M ${x(row.lane)} 0 L ${x(row.lane)} 26`} stroke={color(row.lane)} />}
      {row.parents.map((connection, index) => (
        <path key={`p-${index}`} d={curve(connection.from, connection.to, 26, 52)} stroke={color(index ? connection.to : connection.from)} />
      ))}
      <circle cx={x(row.lane)} cy="26" r={merge ? 4.2 : 3.6} stroke={color(row.lane)} />
    </svg>
  );
}
