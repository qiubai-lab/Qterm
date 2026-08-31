import type { GitCommit } from "../lib/tauri/git";

export interface GitGraphSegment {
  from: number;
  to: number;
  kind: "through" | "parent";
  colorIndex: number;
}

export interface GitGraphLane {
  lane: number;
  colorIndex: number;
}

export interface GitGraphRow {
  currentLane: number;
  currentColor: number;
  laneCount: number;
  incoming: boolean;
  continuingLanes: GitGraphLane[];
  segments: GitGraphSegment[];
}

interface ActiveLane {
  oid: string;
  colorIndex: number;
}

const gitGraphPaletteSize = 6;

export function buildGitGraphRows(commits: GitCommit[]): GitGraphRow[] {
  let lanes: ActiveLane[] = [];
  let nextColor = 0;

  const allocateColor = (activeLanes: ActiveLane[], insertAt: number): number => {
    const usedColors = new Set(activeLanes.map((lane) => lane.colorIndex));
    for (let offset = 0; offset < gitGraphPaletteSize; offset += 1) {
      const colorIndex = (nextColor + offset) % gitGraphPaletteSize;
      if (!usedColors.has(colorIndex)) {
        nextColor = (colorIndex + 1) % gitGraphPaletteSize;
        return colorIndex;
      }
    }

    const adjacentColors = new Set([
      activeLanes[insertAt - 1]?.colorIndex,
      activeLanes[insertAt]?.colorIndex,
    ].filter((colorIndex): colorIndex is number => colorIndex !== undefined));
    for (let offset = 0; offset < gitGraphPaletteSize; offset += 1) {
      const colorIndex = (nextColor + offset) % gitGraphPaletteSize;
      if (!adjacentColors.has(colorIndex)) {
        nextColor = (colorIndex + 1) % gitGraphPaletteSize;
        return colorIndex;
      }
    }

    const colorIndex = nextColor;
    nextColor = (nextColor + 1) % gitGraphPaletteSize;
    return colorIndex;
  };

  return commits.map((commit) => {
    const incoming = lanes.some((lane) => lane.oid === commit.oid);
    const before = incoming
      ? lanes.map((lane) => ({ ...lane }))
      : [...lanes.map((lane) => ({ ...lane })), {
          oid: commit.oid,
          colorIndex: allocateColor(lanes, lanes.length),
        }];
    const currentLane = before.findIndex((lane) => lane.oid === commit.oid);
    const currentColor = before[currentLane].colorIndex;
    const after = before.filter((lane) => lane.oid !== commit.oid);
    const parentColors = new Map<string, number>();

    commit.parents.forEach((parent, parentIndex) => {
      if (after.some((lane) => lane.oid === parent)) {
        parentColors.set(parent, currentColor);
        return;
      }
      const insertionIndex = Math.min(currentLane + parentIndex, after.length);
      const colorIndex = parentIndex === 0
        ? currentColor
        : allocateColor(after, insertionIndex);
      after.splice(insertionIndex, 0, { oid: parent, colorIndex });
      parentColors.set(parent, colorIndex);
    });

    const segments: GitGraphSegment[] = [];
    before.forEach((lane, from) => {
      if (lane.oid === commit.oid) return;
      const to = after.findIndex((nextLane) => nextLane.oid === lane.oid);
      if (to >= 0) segments.push({ from, to, kind: "through", colorIndex: lane.colorIndex });
    });
    commit.parents.forEach((parent) => {
      const to = after.findIndex((lane) => lane.oid === parent);
      if (to >= 0) segments.push({
        from: currentLane,
        to,
        kind: "parent",
        colorIndex: parentColors.get(parent) ?? currentColor,
      });
    });

    lanes = after.map((lane) => ({ ...lane }));
    return {
      currentLane,
      currentColor,
      laneCount: Math.max(before.length, after.length, 1),
      incoming,
      continuingLanes: after.map((lane, laneIndex) => ({
        lane: laneIndex,
        colorIndex: lane.colorIndex,
      })),
      segments,
    };
  });
}
