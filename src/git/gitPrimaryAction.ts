import type { GitSnapshot } from "../lib/tauri/git";

export type GitPrimaryActionKind =
  | "stageAll"
  | "commit"
  | "push"
  | "pull"
  | "publish"
  | "chooseRemote"
  | "idle"
  | "blocked";

export interface GitPrimaryAlternativeAction {
  kind: "stageAll";
  label: string;
}

export interface GitPrimaryAction {
  kind: GitPrimaryActionKind;
  label: string;
  disabled: boolean;
  showMessage: boolean;
  title?: string;
  remote?: string;
  alternative?: GitPrimaryAlternativeAction;
  updating?: boolean;
  remoteConfigurationRequired?: boolean;
}

interface GitPrimaryActionInput {
  snapshot: GitSnapshot | null;
  message: string;
  busy: string;
  unavailable: boolean;
}

function busyLabel(busy: string): string {
  if (busy === "stageAll") return "正在暂存…";
  if (busy === "commit") return "正在提交…";
  if (busy === "推送") return "正在推送…";
  if (busy === "拉取") return "正在拉取…";
  if (busy === "发布分支") return "正在发布…";
  if (busy === "refresh" || busy === "fetch") return "正在刷新…";
  return "正在处理…";
}

function withRuntimeState(action: GitPrimaryAction, busy: string, unavailable: boolean): GitPrimaryAction {
  if (busy) return { ...action, label: busyLabel(busy), disabled: true, alternative: undefined, updating: true };
  if (unavailable && !action.disabled) return { ...action, disabled: true, alternative: undefined };
  return action;
}

export function deriveGitPrimaryAction({ snapshot, message, busy, unavailable }: GitPrimaryActionInput): GitPrimaryAction {
  if (!snapshot) {
    return { kind: "idle", label: busy ? busyLabel(busy) : "正在读取仓库…", disabled: true, showMessage: false, updating: Boolean(busy) };
  }

  const stagedCount = snapshot.changes.filter((change) => change.staged && !change.conflict).length;
  const unstagedChanges = snapshot.changes.filter((change) => !change.staged && !change.conflict);
  const unstagedCount = unstagedChanges.filter((change) => !change.submodule || change.submodule.commitChanged).length;
  const dirtyOnlySubmoduleCount = unstagedChanges.length - unstagedCount;
  const conflictCount = snapshot.changes.filter((change) => change.conflict).length;
  const showMessage = snapshot.changes.length > 0 || snapshot.mergeInProgress;

  if (snapshot.mergeInProgress || conflictCount > 0) {
    return {
      kind: "blocked",
      label: snapshot.mergeInProgress ? "请先完成合并" : "请先解决冲突",
      disabled: true,
      showMessage,
    };
  }

  if (stagedCount > 0) {
    return withRuntimeState({
      kind: "commit",
      label: `提交 ${stagedCount} 项已暂存更改`,
      disabled: !message.trim(),
      showMessage: true,
      title: message.trim() ? "只提交当前已暂存的更改" : "填写提交消息后提交",
      alternative: unstagedCount > 0
        ? { kind: "stageAll", label: `暂存其余 ${unstagedCount} 项更改` }
        : undefined,
    }, busy, unavailable);
  }

  if (unstagedCount > 0) {
    return withRuntimeState({
      kind: "stageAll",
      label: `全部暂存 ${unstagedCount} 项更改`,
      disabled: false,
      showMessage: true,
      title: "将当前工作树更改加入暂存区",
    }, busy, unavailable);
  }

  if (dirtyOnlySubmoduleCount > 0) {
    return {
      kind: "blocked",
      label: "请打开子仓库处理内部修改",
      disabled: true,
      showMessage: false,
      title: "子仓库内部修改不会改变父仓库 gitlink",
    };
  }

  if (snapshot.head.unborn) {
    return { kind: "idle", label: "等待首次提交", disabled: true, showMessage: false };
  }
  if (snapshot.head.detached || !snapshot.head.name) {
    return { kind: "blocked", label: "分离 HEAD 无法同步", disabled: true, showMessage: false };
  }

  if (!snapshot.head.upstream) {
    if (snapshot.remotes.length === 0) {
      return { kind: "idle", label: "未配置远端", disabled: true, showMessage: false, remoteConfigurationRequired: true };
    }
    if (snapshot.remotes.length === 1) {
      const remote = snapshot.remotes[0];
      return withRuntimeState({
        kind: "publish",
        label: `发布到 ${remote}`,
        disabled: false,
        showMessage: false,
        remote,
        title: `发布当前分支并设置 ${remote} upstream`,
      }, busy, unavailable);
    }
    return withRuntimeState({
      kind: "chooseRemote",
      label: "发布分支…",
      disabled: false,
      showMessage: false,
      title: "选择已有 remote 并发布当前分支",
    }, busy, unavailable);
  }

  if (snapshot.head.ahead > 0 && snapshot.head.behind > 0) {
    return { kind: "blocked", label: "分支已分叉", disabled: true, showMessage: false, title: "需要先处理本地与远端的分叉" };
  }
  if (snapshot.head.ahead > 0) {
    return withRuntimeState({
      kind: "push",
      label: `推送 ${snapshot.head.ahead} 个提交`,
      disabled: false,
      showMessage: false,
      title: `推送到 ${snapshot.head.upstream}`,
    }, busy, unavailable);
  }
  if (snapshot.head.behind > 0) {
    return withRuntimeState({
      kind: "pull",
      label: `拉取 ${snapshot.head.behind} 个提交`,
      disabled: false,
      showMessage: false,
      title: `从 ${snapshot.head.upstream} 执行 FF-only Pull`,
    }, busy, unavailable);
  }
  return { kind: "idle", label: "没有待同步内容", disabled: true, showMessage: false };
}
