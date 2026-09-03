import { describe, expect, it } from "vitest";

import type { GitSnapshot, GitSubmodule } from "../lib/tauri/git";
import { buildGitRepositoryTree, gitRepositorySelectionUnavailableReason, joinGitRepositoryPath } from "./gitRepositoryContext";

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

  it("explains every persistent and temporary repository selection restriction", () => {
    const child = (overrides: Partial<GitSubmodule> = {}) => buildGitRepositoryTree("/srv/project", new Map([["/srv/project", snapshot("/srv/project", [submodule("modules/child", overrides)])]]), new Set(["/srv/project"]))[1];
    const cases: Array<[Partial<GitSubmodule>, string]> = [
      [{ initialized: false, currentOid: null }, "子模块尚未初始化。请点击“初始化”后再选择。"],
      [{ conflict: true }, "子模块引用存在冲突。请先在父仓库解决该路径的合并冲突。"],
      [{ issue: "missingConfiguration" }, "缺少 .gitmodules 配置。请修复对应路径配置后刷新仓库。"],
      [{ issue: "missingGitlink" }, "父仓库索引缺少 Gitlink。请恢复子模块引用后刷新仓库。"],
      [{ issue: "duplicatePath" }, "子模块名称或路径配置重复。请修正 .gitmodules 后刷新仓库。"],
      [{ issue: "invalidPath" }, "子模块路径无效。请修正 .gitmodules 中的相对路径后刷新仓库。"],
      [{ issue: "unreadable" }, "无法读取子模块状态。请检查路径、权限和 Git 配置后刷新仓库。"],
    ];
    for (const [overrides, reason] of cases) expect(gitRepositorySelectionUnavailableReason(child(overrides), false, true)).toBe(reason);
    expect(gitRepositorySelectionUnavailableReason(child(), true, true)).toBe("Git 操作正在进行。请等待当前操作完成后再选择。");
    expect(gitRepositorySelectionUnavailableReason(child(), true, false)).toBe("远程 Git 尚未连接。请恢复连接后再选择。");
    expect(gitRepositorySelectionUnavailableReason(child(), false, true)).toBeNull();
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
