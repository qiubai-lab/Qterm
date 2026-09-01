import { describe, expect, it } from "vitest";

import { presentGitFileStatus } from "./gitStatus";

describe("Git file status presentation", () => {
  it.each([
    ["A", "新增", "added"],
    ["M", "修改", "modified"],
    ["U", "未跟踪", "untracked"],
    ["D", "删除", "deleted"],
    ["R100", "重命名", "renamed"],
    ["C075", "复制", "copied"],
    ["T", "类型变更", "modified"],
    ["!", "冲突", "conflict"],
    ["X", "未知状态", "default"],
  ] as const)("maps %s to %s", (raw, label, tone) => {
    expect(presentGitFileStatus(raw)).toEqual({ label, tone });
  });

  it("distinguishes an unmerged commit status from an untracked worktree file", () => {
    expect(presentGitFileStatus("U", { context: "commit" })).toEqual({ label: "冲突", tone: "conflict" });
    expect(presentGitFileStatus("M", { conflict: true })).toEqual({ label: "冲突", tone: "conflict" });
  });
});
