import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../components/Icon";
import type { GitChange, GitSnapshot } from "../lib/tauri/git";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { GitPrimaryActionButton } from "./GitPrimaryActionButton";
import type { GitPrimaryAction, GitPrimaryAlternativeAction } from "./gitPrimaryAction";
import { branchOverlayKinds, type GitRepositoryOverlay, type GitRepositoryOverlayKind } from "./gitPaneTypes";
import { presentGitFileStatus } from "./gitStatus";

interface GitRepositorySectionProps {
  root: string | null;
  repositoryPath: string;
  snapshot: GitSnapshot | null;
  collapsed: boolean;
  branchLabel: string;
  mergeInProgress: boolean;
  disabled: boolean;
  updating: boolean;
  remote: boolean;
  remoteReady: boolean;
  runtime?: GitRuntime;
  error: { code: string; message: string } | null;
  repositoryOverlay: GitRepositoryOverlay | null;
  branchButtonRef: RefObject<HTMLButtonElement | null>;
  repositoryActionsButtonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onFetch: () => void;
  onOpenOverlay: (kind: GitRepositoryOverlayKind) => void;
}

export function GitRepositorySection({
  root,
  repositoryPath,
  snapshot,
  collapsed,
  branchLabel,
  mergeInProgress,
  disabled,
  updating,
  remote,
  remoteReady,
  runtime,
  error,
  repositoryOverlay,
  branchButtonRef,
  repositoryActionsButtonRef,
  onToggle,
  onFetch,
  onOpenOverlay,
}: GitRepositorySectionProps) {
  return <GitSection className="git-repository-section" title="存储库" meta={root ?? repositoryPath} collapsed={collapsed} onToggle={onToggle}>
    <div className="git-repository-card">
      <div className="git-repository-row">
        <Icon name="git" size={15}/>
        <span className="git-repository-name">{snapshot?.repositoryName ?? repositoryPath}</span>
        {snapshot && <button ref={branchButtonRef} type="button" className="git-branch-trigger" aria-label={`切换分支，当前 ${branchLabel}`} title={mergeInProgress ? "完成或中止当前合并后才能切换分支" : `切换分支 · ${branchLabel}`} aria-haspopup="dialog" aria-expanded={Boolean(repositoryOverlay && branchOverlayKinds.has(repositoryOverlay.kind))} disabled={disabled || mergeInProgress} onClick={() => onOpenOverlay("branches")}>
          <Icon name="git" size={12}/><span>{branchLabel}</span>
        </button>}
        <div className="git-repository-actions">
          {snapshot?.head.upstream && <span className="git-repository-sync" aria-label={`领先 ${snapshot.head.ahead} 个提交，落后 ${snapshot.head.behind} 个提交`} title={`领先 ${snapshot.head.ahead} · 落后 ${snapshot.head.behind}`}><span>↑{snapshot.head.ahead}</span><span>↓{snapshot.head.behind}</span></span>}
          <button type="button" className="git-repository-refresh" data-updating={updating || undefined} aria-busy={updating || undefined} aria-label={updating ? "正在更新 Git 状态" : "刷新 Git 状态"} title={mergeInProgress ? "完成或中止当前合并后才能获取远程更新" : updating ? "正在更新仓库状态" : "获取远程更新并刷新"} disabled={disabled || updating || mergeInProgress} onClick={onFetch}><Icon name="sync" size={14}/></button>
          {snapshot && <button ref={repositoryActionsButtonRef} type="button" aria-label="Git 仓库操作" title="Pull、Push、同步、合并、分支管理与操作记录" aria-haspopup="menu" aria-expanded={Boolean(repositoryOverlay && !branchOverlayKinds.has(repositoryOverlay.kind))} disabled={!remoteReady} onClick={() => onOpenOverlay("repositoryActions")}><Icon name="more" size={13}/></button>}
        </div>
      </div>
      {remote && runtime?.stale && <div className="git-feedback stale" role="status">连接已断开，当前内容可能已过期；重新连接后将自动刷新。</div>}
      {error && snapshot && <div className="git-feedback stale" role="status">上次 Git 操作失败，已保留并重新读取可用状态。</div>}
    </div>
  </GitSection>;
}

interface GitChangesSectionProps {
  snapshot: GitSnapshot | null;
  collapsed: boolean;
  disabled: boolean;
  mergeInProgress: boolean;
  root: string | null;
  message: string;
  error: { code: string; message: string } | null;
  staged: GitChange[];
  unstaged: GitChange[];
  conflicts: GitChange[];
  messageRef: RefObject<HTMLTextAreaElement | null>;
  mergeAbortButtonRef: RefObject<HTMLButtonElement | null>;
  primaryAction: GitPrimaryAction;
  onToggle: () => void;
  onMessageChange: (message: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onPrimaryAction: (action: GitPrimaryAction | GitPrimaryAlternativeAction) => void;
  onStage: (change: GitChange) => void;
  onPreviewChange: (change: GitChange) => void;
  onResolveConflict: (change: GitChange) => void;
  onUnstage: (change: GitChange) => void;
  selectedStagedPaths: ReadonlySet<string>;
  selectedUnstagedPaths: ReadonlySet<string>;
  onSelectStaged: (change: GitChange, index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onSelectUnstaged: (change: GitChange, index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenStagedMenu: (change: GitChange, index: number, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLButtonElement>) => void;
  onOpenUnstagedMenu: (change: GitChange, index: number, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLButtonElement>) => void;
  onContinueMerge: () => void;
  onAbortMerge: () => void;
}

export function GitChangesSection({
  snapshot,
  collapsed,
  disabled,
  mergeInProgress,
  root,
  message,
  error,
  staged,
  unstaged,
  conflicts,
  messageRef,
  mergeAbortButtonRef,
  primaryAction,
  onToggle,
  onMessageChange,
  onStageAll,
  onUnstageAll,
  onPrimaryAction,
  onStage,
  onPreviewChange,
  onResolveConflict,
  onUnstage,
  selectedStagedPaths,
  selectedUnstagedPaths,
  onSelectStaged,
  onSelectUnstaged,
  onOpenStagedMenu,
  onOpenUnstagedMenu,
  onContinueMerge,
  onAbortMerge,
}: GitChangesSectionProps) {
  return <GitSection className="git-changes-section" title={`更改${snapshot ? ` ${snapshot.changes.length}` : ""}`} collapsed={collapsed} onToggle={onToggle} actions={<>
    <button type="button" aria-label="暂存全部更改" title={mergeInProgress && conflicts.length > 0 ? "合并冲突需要逐项解决" : "暂存全部"} disabled={disabled || !root || mergeInProgress && conflicts.length > 0 || unstaged.length + conflicts.length === 0} onClick={onStageAll}><Icon name="plus" size={12}/></button>
    <button type="button" aria-label="取消暂存全部更改" title="取消暂存全部" disabled={disabled || !root || staged.length === 0} onClick={onUnstageAll}><Icon name="clear" size={12}/></button>
  </>}>
    {mergeInProgress && <div className="git-merge-state" role="status">
      <Icon name="git" size={15}/>
      <div className="git-merge-state-copy"><strong>合并未完成</strong><span>{conflicts.length > 0 ? `${conflicts.length} 个冲突等待解决` : "冲突已解决，可以继续合并"}</span></div>
      <div className="git-merge-state-actions"><button type="button" className="secondary" disabled={disabled || conflicts.length > 0} onClick={onContinueMerge}>继续合并</button><button ref={mergeAbortButtonRef} type="button" className="danger" disabled={disabled} onClick={onAbortMerge}>中止合并</button></div>
    </div>}
    <div className="git-commit-box" data-action={primaryAction.kind}>
      {primaryAction.showMessage && <textarea ref={messageRef} aria-label="提交消息" rows={1} data-max-rows="5" value={message} maxLength={10_000} placeholder="提交消息" onChange={(event) => onMessageChange(event.target.value)}/>}
      <GitPrimaryActionButton key={`${primaryAction.kind}:${primaryAction.label}`} action={primaryAction} onAction={onPrimaryAction}/>
    </div>
    {error && <div className="git-feedback" role="alert">{error.message}</div>}
    <div className="git-change-scroll" role="list" aria-label="Git 更改">
      {conflicts.length > 0 && <GitChangeList title="冲突" changes={conflicts} actionLabel="解决冲突" actionIcon="mergeConflict" showActionText onAction={onResolveConflict}/>}
      {staged.length > 0 && <GitChangeList title="暂存的更改" changes={staged} actionLabel="取消暂存" actionIcon="clear" onAction={onUnstage} onPreview={onPreviewChange} selectedPaths={selectedStagedPaths} onSelect={onSelectStaged} onOpenContextMenu={onOpenStagedMenu}/>}
      {unstaged.length > 0 && <GitChangeList title="更改" changes={unstaged} actionLabel="暂存" actionIcon="plus" onAction={onStage} onPreview={onPreviewChange} selectedPaths={selectedUnstagedPaths} onSelect={onSelectUnstaged} onOpenContextMenu={onOpenUnstagedMenu}/>}
      {snapshot && snapshot.changes.length === 0 && <div className="git-clean-state"><Icon name="checkCircle" size={16}/>工作区干净</div>}
      {!snapshot && !error && <div className="git-clean-state">正在读取仓库…</div>}
    </div>
  </GitSection>;
}

export function GitSection({ title, meta, collapsed, onToggle, actions, className = "", children }: {
  title: string;
  meta?: string | null;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return <section className={`git-section ${className}${collapsed ? " collapsed" : ""}`} data-collapsed={collapsed}>
    <header className="git-section-header"><button type="button" className="git-section-toggle" aria-expanded={!collapsed} onClick={onToggle}><Icon name="chevronDown" size={10}/><span className="git-section-title">{title}</span>{meta && <span className="git-section-meta" aria-hidden="true" title={meta}>{meta}</span>}</button>{actions && <div className="git-section-actions">{actions}</div>}</header>
    <div className="git-section-body" aria-hidden={collapsed} inert={collapsed || undefined}><div className="git-section-content">{children}</div></div>
  </section>;
}

function GitChangeList({ title, changes, actionLabel, actionIcon, showActionText = false, onAction, onPreview, selectedPaths, onSelect, onOpenContextMenu }: { title: string; changes: GitChange[]; actionLabel: string; actionIcon: IconName; showActionText?: boolean; onAction: (change: GitChange) => void; onPreview?: (change: GitChange) => void; selectedPaths?: ReadonlySet<string>; onSelect?: (change: GitChange, index: number, event: MouseEvent<HTMLButtonElement>) => void; onOpenContextMenu?: (change: GitChange, index: number, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLButtonElement>) => void }) {
  const visible = changes.slice(0, 500);
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(null);
  const [selectionHint, setSelectionHint] = useState<{ id: number; path: string; target: HTMLButtonElement } | null>(null);
  const selectionHintId = useId();
  const hintSequence = useRef(0);
  const hintTimer = useRef<number | null>(null);

  function clearSelectionHint() {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = null;
    setSelectionHint(null);
  }

  function showSelectionHint(path: string, target: HTMLButtonElement) {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    const id = ++hintSequence.current;
    setSelectionHint({ id, path, target });
    hintTimer.current = window.setTimeout(() => {
      setSelectionHint((current) => current?.id === id ? null : current);
      hintTimer.current = null;
    }, 1800);
  }

  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
  }, []);

  useEffect(() => {
    if (!selectionHint) return;
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") clearSelectionHint();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [selectionHint]);

  return <section className="git-change-group" aria-label={title}><div className="git-change-group-title">{title}<span>{changes.length}</span></div>{visible.map((change, index) => {
    const selected = selectedPaths ? selectedPaths.has(change.path) : localSelectedPath === change.path;
    const status = presentGitFileStatus(change.status, { conflict: change.conflict });
    return <div className={`git-change-row${onPreview ? " previewable" : ""}`} role="listitem" data-selected={selected || undefined} key={`${change.path}:${change.staged}:${change.status}`} title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path} onContextMenu={onOpenContextMenu ? (event) => onOpenContextMenu(change, index, event) : undefined}>
      {onPreview ? <button type="button" className="git-change-preview-trigger" aria-label={`预览${change.staged ? "已暂存" : "工作区"}更改 ${change.path}`} aria-pressed={selected} aria-describedby={selectionHint?.path === change.path ? selectionHintId : undefined} onClick={(event) => {
        const modifiedSelection = event.ctrlKey || event.metaKey || event.shiftKey;
        onSelect?.(change, index, event);
        if (!selectedPaths) setLocalSelectedPath(change.path);
        if (modifiedSelection) {
          clearSelectionHint();
        } else if (selected) {
          clearSelectionHint();
          onPreview(change);
        } else {
          showSelectionHint(change.path, event.currentTarget);
        }
      }} onKeyDown={onOpenContextMenu ? (event) => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") onOpenContextMenu(change, index, event); } : undefined}><Icon name="file" size={13}/><span className="git-change-path">{change.path}</span><span className="git-change-status" title={`Git 状态：${status.label}`}>{status.label}</span></button> : <><Icon name={change.conflict ? "mergeConflict" : "file"} size={13}/><span className="git-change-path">{change.path}</span><span className={`git-change-status${change.conflict ? " conflict" : ""}`} title={`Git 状态：${status.label}`}>{status.label}</span></>}<button type="button" className={showActionText ? "git-conflict-action" : undefined} aria-label={`${actionLabel} ${change.path}`} title={actionLabel} onClick={() => onAction(change)}><Icon name={actionIcon} size={11}/>{showActionText && <span>解决</span>}</button>
    </div>;
  })}{changes.length > visible.length && <div className="git-list-limit">另有 {changes.length - visible.length} 项，请使用终端处理后刷新</div>}{selectionHint && <GitChangeSelectionHint id={selectionHintId} feedback={selectionHint}/>}</section>;
}

function GitChangeSelectionHint({ id, feedback }: { id: string; feedback: { id: number; path: string; target: HTMLButtonElement } }) {
  const [position, setPosition] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  useEffect(() => {
    function updatePosition() {
      if (!feedback.target.isConnected) { setPosition(null); return; }
      const rect = feedback.target.getBoundingClientRect();
      const placement = rect.bottom + 38 > window.innerHeight ? "above" : "below";
      setPosition({
        left: Math.max(8, Math.min(rect.left + 10, window.innerWidth - 206)),
        top: placement === "above" ? Math.max(8, rect.top - 6) : Math.min(window.innerHeight - 8, rect.bottom + 6),
        placement,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [feedback]);

  if (!position) return null;
  return createPortal(<p id={id} className="git-change-selection-hint" data-placement={position.placement} role="status" aria-live="polite" aria-atomic="true" style={{ left: position.left, top: position.top }}>已选择，再次点击打开预览</p>, document.body);
}

export function GitEmpty({ icon, title, detail, action, secondary, onAction, onSecondary }: { icon: "git"; title: string; detail: string; action?: string; secondary?: string; onAction?: () => void; onSecondary?: () => void }) {
  return <div className="git-empty"><Icon name={icon} size={28}/><strong>{title}</strong><span>{detail}</span><div>{action && <button type="button" onClick={onAction}>{action}</button>}{secondary && <button type="button" className="secondary" onClick={onSecondary}>{secondary}</button>}</div></div>;
}
