import { describe, expect, it } from "vitest";

import { snapshot } from "./GitPane.testHarness";
import { gitSnapshotsPresentSameState } from "./gitSnapshot";

describe("gitSnapshotsPresentSameState", () => {
  it("treats cloned snapshot data as equivalent", () => {
    expect(gitSnapshotsPresentSameState(snapshot, structuredClone(snapshot))).toBe(true);
  });

  it.each([
    ["head", { ...snapshot, head: { ...snapshot.head, behind: 1 } }],
    ["changes", { ...snapshot, changes: [...snapshot.changes, { path: "src/other.ts", originalPath: null, status: "M", staged: false, conflict: false }] }],
    ["branches", { ...snapshot, branches: [{ ...snapshot.branches[0], oid: "different" }] }],
    ["remotes", { ...snapshot, remotes: ["upstream"] }],
    ["commits", { ...snapshot, commits: [{ ...snapshot.commits[0], subject: "changed" }] }],
    ["merge state", { ...snapshot, mergeInProgress: true, mergeHeadOid: "merge-head" }],
  ])("detects changed %s presentation", (_label, next) => {
    expect(gitSnapshotsPresentSameState(snapshot, next)).toBe(false);
  });
});
