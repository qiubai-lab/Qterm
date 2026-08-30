import type { GitCommit } from "../lib/tauri/git";

export interface GitGraphSegment {
  from: number;
  to: number;
  kind: "through" | "parent";
}

export interface GitGraphRow {
  currentLane: number;
  laneCount: number;
  incoming: boolean;
  segments: GitGraphSegment[];
}

export function buildGitGraphRows(commits: GitCommit[]): GitGraphRow[] {
  let lanes: string[] = [];
  return commits.map((commit) => {
    const incoming = lanes.includes(commit.oid);
    const before = incoming ? [...lanes] : [...lanes, commit.oid];
    const currentLane = before.indexOf(commit.oid);
    const after = before.filter((oid) => oid !== commit.oid);

    commit.parents.forEach((parent, parentIndex) => {
      if (after.includes(parent)) return;
      after.splice(Math.min(currentLane + parentIndex, after.length), 0, parent);
    });

    const segments: GitGraphSegment[] = [];
    before.forEach((oid, from) => {
      if (oid === commit.oid) return;
      const to = after.indexOf(oid);
      if (to >= 0) segments.push({ from, to, kind: "through" });
    });
    commit.parents.forEach((parent) => {
      const to = after.indexOf(parent);
      if (to >= 0) segments.push({ from: currentLane, to, kind: "parent" });
    });

    lanes = after;
    return {
      currentLane,
      laneCount: Math.max(before.length, after.length, 1),
      incoming,
      segments,
    };
  });
}
