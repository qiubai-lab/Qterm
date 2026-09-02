import { describe, expect, it } from "vitest";

import type { GitSnapshot } from "../lib/tauri/git";
import { deriveGitPrimaryAction } from "./gitPrimaryAction";

const cleanSnapshot: GitSnapshot = {
  repositoryPath: "D:/work/project",
  repositoryName: "project",
  head: { name: "main", oid: "abcdef012345", detached: false, unborn: false, upstream: "origin/main", ahead: 0, behind: 0 },
  changes: [],
  branches: [{ refName: "refs/heads/main", name: "main", kind: "local", oid: "abcdef012345", current: true, upstream: "origin/main", upstreamRef: "refs/remotes/origin/main" }],
  remotes: ["origin"],
  commits: [],
  mergeInProgress: false,
};

function derive(snapshot: GitSnapshot, message = "", busy = "", unavailable = false) {
  return deriveGitPrimaryAction({ snapshot, message, busy, unavailable });
}

describe("deriveGitPrimaryAction", () => {
  it("prioritizes committing an explicit staged subset and offers staging the remainder", () => {
    const mixed = {
      ...cleanSnapshot,
      changes: [
        { path: "staged.ts", originalPath: null, status: "M", staged: true, conflict: false },
        { path: "unstaged.ts", originalPath: null, status: "M", staged: false, conflict: false },
      ],
    } satisfies GitSnapshot;

    expect(derive(mixed)).toMatchObject({
      kind: "commit",
      label: "提交 1 项已暂存更改",
      disabled: true,
      showMessage: true,
      alternative: { kind: "stageAll", label: "暂存其余 1 项更改" },
    });
    expect(derive(mixed, "feat: selected change")).toMatchObject({ kind: "commit", disabled: false });
  });

  it("offers stage all when nothing is staged and blocks unresolved conflicts", () => {
    const unstaged = {
      ...cleanSnapshot,
      changes: [{ path: "new.ts", originalPath: null, status: "U", staged: false, conflict: false }],
    } satisfies GitSnapshot;
    expect(derive(unstaged)).toMatchObject({ kind: "stageAll", label: "全部暂存 1 项更改", disabled: false, showMessage: true });

    const conflicted = {
      ...unstaged,
      mergeInProgress: true,
      changes: [{ path: "conflict.ts", originalPath: null, status: "!", staged: false, conflict: true }],
    } satisfies GitSnapshot;
    expect(derive(conflicted)).toMatchObject({ kind: "blocked", label: "请先完成合并", disabled: true, showMessage: true });
  });

  it("does not offer parent staging for a dirty-only submodule", () => {
    const dirtySubmodule = {
      ...cleanSnapshot,
      changes: [{
        path: "modules/child",
        originalPath: null,
        status: "M",
        staged: false,
        conflict: false,
        submodule: { commitChanged: false, trackedModified: true, untrackedContent: false },
      }],
    } satisfies GitSnapshot;

    expect(derive(dirtySubmodule)).toMatchObject({
      kind: "blocked",
      label: "请打开子仓库处理内部修改",
      disabled: true,
      showMessage: false,
    });
  });

  it("maps clean tracked branches to one safe network action", () => {
    expect(derive({ ...cleanSnapshot, head: { ...cleanSnapshot.head, ahead: 2 } })).toMatchObject({ kind: "push", label: "推送 2 个提交", disabled: false, showMessage: false });
    expect(derive({ ...cleanSnapshot, head: { ...cleanSnapshot.head, behind: 3 } })).toMatchObject({ kind: "pull", label: "拉取 3 个提交", disabled: false });
    expect(derive({ ...cleanSnapshot, head: { ...cleanSnapshot.head, ahead: 1, behind: 1 } })).toMatchObject({ kind: "blocked", label: "分支已分叉", disabled: true });
    expect(derive(cleanSnapshot)).toMatchObject({ kind: "idle", label: "没有待同步内容", disabled: true });
  });

  it("publishes only ordinary clean branches with an existing remote", () => {
    const untracked = { ...cleanSnapshot, head: { ...cleanSnapshot.head, upstream: null } } satisfies GitSnapshot;
    expect(derive(untracked)).toMatchObject({ kind: "publish", label: "发布到 origin", remote: "origin", disabled: false });
    expect(derive({ ...untracked, remotes: ["origin", "mirror"] })).toMatchObject({ kind: "chooseRemote", label: "发布分支…", disabled: false });
    expect(derive({ ...untracked, remotes: [] })).toMatchObject({ kind: "idle", label: "未配置远端", disabled: true, remoteConfigurationRequired: true });
    expect(derive({ ...untracked, head: { ...untracked.head, detached: true } })).toMatchObject({ kind: "blocked", label: "分离 HEAD 无法同步", disabled: true });
    expect(derive({ ...untracked, head: { ...untracked.head, unborn: true, oid: null } })).toMatchObject({ kind: "idle", label: "等待首次提交", disabled: true });
  });

  it("disables actionable states while unavailable and reports the active busy step", () => {
    const ahead = { ...cleanSnapshot, head: { ...cleanSnapshot.head, ahead: 1 } } satisfies GitSnapshot;
    expect(derive(ahead, "", "", true)).toMatchObject({ kind: "push", disabled: true, label: "推送 1 个提交" });
    expect(derive(ahead, "", "推送")).toMatchObject({ kind: "push", disabled: true, label: "正在推送…", updating: true });
  });
});
