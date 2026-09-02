import { describe, expect, it } from "vitest";

import type { GitSnapshot, GitSubmodule } from "../lib/tauri/git";
import { buildGitRepositoryTree, joinGitRepositoryPath } from "./gitRepositoryContext";

const head = { name: "main", oid: "1", detached: false, unborn: false, upstream: null, ahead: 0, behind: 0 };

function submodule(path: string, overrides: Partial<GitSubmodule> = {}): GitSubmodule {
  const segments = path.split("/");
  return {
    name: segments[segments.length - 1] ?? path,
    path,
    recordedOid: "1".repeat(40),
    currentOid: "1".repeat(40),
    initialized: true,
    commitChanged: false,
    trackedModified: false,
    untrackedContent: false,
    conflict: false,
    issue: null,
    ...overrides,
  };
}

function snapshot(path: string, children: GitSubmodule[] = []): GitSnapshot {
  const segments = path.split("/");
  return { repositoryPath: path, repositoryName: segments[segments.length - 1] ?? path, head, changes: [], submodules: children, branches: [], remotes: [], commits: [], mergeInProgress: false };
}

describe("git repository context model", () => {
  it("builds only expanded, loaded repository levels", () => {
    const root = "D:/work/project";
    const child = `${root}/modules/child`;
    const snapshots = new Map([
      [root, snapshot(root, [submodule("modules/child")])],
      [child, snapshot(child, [submodule("deps/grandchild")])],
    ]);

    expect(buildGitRepositoryTree(root, snapshots, new Set([root])).map((node) => node.path)).toEqual([root, child]);
    expect(buildGitRepositoryTree(root, snapshots, new Set([root, child])).map((node) => node.path)).toEqual([
      root,
      child,
      `${child}/deps/grandchild`,
    ]);
  });

  it("keeps invalid and uninitialized submodules visible but unselectable", () => {
    const root = "/srv/project";
    const nodes = buildGitRepositoryTree(root, new Map([[root, snapshot(root, [
      submodule("modules/missing", { initialized: false, currentOid: null }),
      submodule("modules/broken", { issue: "invalidPath" }),
    ])]]), new Set([root]));

    expect(nodes.slice(1).map((node) => ({ path: node.relativePath, selectable: node.selectable, state: node.state }))).toEqual([
      { path: "modules/missing", selectable: false, state: "未初始化" },
      { path: "modules/broken", selectable: false, state: "路径无效" },
    ]);
  });

  it("rejects absolute, parent, empty-segment, and NUL paths", () => {
    expect(joinGitRepositoryPath("/srv/project", "modules/child")).toBe("/srv/project/modules/child");
    expect(joinGitRepositoryPath("/srv/project", "/tmp/child")).toBeNull();
    expect(joinGitRepositoryPath("D:/work/project", "C:/other")).toBeNull();
    expect(joinGitRepositoryPath("/srv/project", "../child")).toBeNull();
    expect(joinGitRepositoryPath("/srv/project", "modules//child")).toBeNull();
    expect(joinGitRepositoryPath("/srv/project", "modules/\0child")).toBeNull();
  });
});
