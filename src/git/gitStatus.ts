export type GitFileStatusTone = "added" | "modified" | "untracked" | "deleted" | "renamed" | "copied" | "conflict" | "default";

interface GitFileStatusOptions {
  conflict?: boolean;
  context?: "change" | "commit";
}

export interface GitFileStatusPresentation {
  label: string;
  tone: GitFileStatusTone;
}

export function presentGitFileStatus(status: string, options: GitFileStatusOptions = {}): GitFileStatusPresentation {
  const code = status.trim().charAt(0).toUpperCase();
  if (options.conflict || code === "!") return { label: "冲突", tone: "conflict" };
  if (code === "A") return { label: "新增", tone: "added" };
  if (code === "M") return { label: "修改", tone: "modified" };
  if (code === "U") return options.context === "commit"
    ? { label: "冲突", tone: "conflict" }
    : { label: "未跟踪", tone: "untracked" };
  if (code === "?") return { label: "未跟踪", tone: "untracked" };
  if (code === "D") return { label: "删除", tone: "deleted" };
  if (code === "R") return { label: "重命名", tone: "renamed" };
  if (code === "C") return { label: "复制", tone: "copied" };
  if (code === "T") return { label: "类型变更", tone: "modified" };
  return { label: "未知状态", tone: "default" };
}
