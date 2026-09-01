import { createPortal } from "react-dom";
import type { RefObject } from "react";

import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import type { GitBranch, GitCommit, GitSnapshot } from "../lib/tauri/git";
import {
  formatRelativeCommitTime,
  operationStatusLabel,
  type GitCommitContextMenu as GitCommitContextMenuState,
  type GitMergeConfirmation,
  type GitOperationRecord,
  type GitRepositoryOverlay,
  type GitRepositoryOverlayKind,
  type GitRepositorySubmenu,
} from "./gitPaneTypes";

interface GitRepositoryOverlaysProps {
  visible: boolean;
  blockId: string;
  snapshot: GitSnapshot | null;
  root: string | null;
  repositoryOverlay: GitRepositoryOverlay | null;
  repositorySubmenu: GitRepositorySubmenu | null;
  mergeConfirmation: GitMergeConfirmation | null;
  commitBranchSource: GitCommit | null;
  repositoryOverlayRef: RefObject<HTMLElement | null>;
  repositorySubmenuRef: RefObject<HTMLElement | null>;
  branchManagementItemRef: RefObject<HTMLButtonElement | null>;
  repositorySubmenuId: string;
  branchQuery: string;
  newBranch: string;
  branchSourceRef: string;
  selectedBranchRef: string;
  selectedRemote: string;
  mergeSourceRef: string;
  branchLabel: string;
  disabled: boolean;
  busy: string;
  error: { code: string; message: string } | null;
  mergeInProgress: boolean;
  mergeWorktreeClean: boolean;
  branchOptions: GitBranch[];
  visibleBranches: GitBranch[];
  visibleLocalBranches: GitBranch[];
  visibleRemoteBranches: GitBranch[];
  localBranchOptions: GitBranch[];
  deletableBranchOptions: GitBranch[];
  mergeSourceOptions: GitBranch[];
  selectedMergeSource: GitBranch | null;
  operations: GitOperationRecord[];
  onBranchQueryChange: (value: string) => void;
  onNewBranchChange: (value: string) => void;
  onBranchSourceRefChange: (value: string) => void;
  onSelectedBranchRefChange: (value: string) => void;
  onSelectedRemoteChange: (value: string) => void;
  onMergeSourceRefChange: (value: string) => void;
  onMergeConfirmationChange: (value: GitMergeConfirmation | null) => void;
  onOpenOverlay: (kind: GitRepositoryOverlayKind) => void;
  onCloseOverlay: (restoreFocus?: boolean) => void;
  onOpenBranchSubmenu: (moveFocus: boolean) => void;
  onCloseBranchSubmenu: (restoreFocus: boolean) => void;
  onDismissBranchSubmenu: () => void;
  onNavigateMenu: (event: React.KeyboardEvent<HTMLElement>) => void;
  onSelectBranch: (branch: GitBranch, current: boolean) => void;
  onCreateBranch: (name: string) => Promise<boolean>;
  onPull: () => void;
  onPush: () => void;
  onSynchronize: () => void;
  onCreateBranchAt: (name: string, sourceRef: string) => Promise<boolean>;
  onCreateBranchFromCommit: (name: string, oid: string) => Promise<boolean>;
  onRenameBranch: (refName: string, name: string) => Promise<boolean>;
  onDeleteBranch: (refName: string) => Promise<boolean>;
  onPublishBranch: (remote: string) => Promise<boolean>;
  onAbortMerge: () => Promise<boolean>;
  onConfirmMerge: () => void;
}

export function GitCommitContextMenu({ menu, menuRef, disabled, onNavigateMenu, onCreateBranch }: {
  menu: GitCommitContextMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onNavigateMenu: (event: React.KeyboardEvent<HTMLElement>) => void;
  onCreateBranch: (commit: GitCommit) => void;
}) {
  if (!menu) return null;
  return createPortal(<div
    ref={menuRef}
    className="git-repository-popover git-repository-action-popover git-commit-context-menu"
    data-placement={menu.placement}
    role="menu"
    aria-label={`${menu.commit.subject} 提交菜单`}
    style={{ left: menu.left, top: menu.top }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={onNavigateMenu}
  >
    <div className="git-commit-context-heading" role="presentation"><strong title={menu.commit.subject}>{menu.commit.subject}</strong><code>{menu.commit.oid.slice(0, 8)}</code></div>
    <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled} onClick={() => onCreateBranch(menu.commit)}><Icon name="plus" size={12}/><span>从此提交创建分支…</span></button>
  </div>, document.body);
}

export function GitRepositoryOverlays(props: GitRepositoryOverlaysProps) {
  const { visible, repositoryOverlay, mergeConfirmation } = props;
  return <>
    {visible && repositoryOverlay && createPortal(<GitRepositoryOverlayContent {...props}/>, document.body)}
    {visible && mergeConfirmation && createPortal(<GitMergeConfirmationDialog {...props}/>, document.body)}
  </>;
}

function GitRepositoryOverlayContent(props: GitRepositoryOverlaysProps) {
  const {
    blockId, snapshot, root, repositoryOverlay, repositorySubmenu, mergeConfirmation, commitBranchSource, repositoryOverlayRef,
    repositorySubmenuRef, branchManagementItemRef, repositorySubmenuId, branchQuery, newBranch,
    branchSourceRef, selectedBranchRef, selectedRemote, mergeSourceRef, branchLabel, disabled, error,
    mergeInProgress, mergeWorktreeClean, branchOptions, visibleBranches, visibleLocalBranches,
    visibleRemoteBranches, localBranchOptions, deletableBranchOptions, mergeSourceOptions,
    selectedMergeSource, operations, onBranchQueryChange, onNewBranchChange, onBranchSourceRefChange,
    onSelectedBranchRefChange, onSelectedRemoteChange, onMergeSourceRefChange, onMergeConfirmationChange,
    onOpenOverlay, onCloseOverlay, onOpenBranchSubmenu, onCloseBranchSubmenu, onDismissBranchSubmenu,
    onNavigateMenu, onSelectBranch, onCreateBranch, onPull, onPush, onSynchronize, onCreateBranchAt, onCreateBranchFromCommit,
    onRenameBranch, onDeleteBranch, onPublishBranch, onAbortMerge,
  } = props;
  if (!repositoryOverlay) return null;

  const common = {
    "data-placement": repositoryOverlay.placement,
    style: { left: repositoryOverlay.left, top: repositoryOverlay.top },
  };
  const overlayRef = (node: HTMLElement | null) => { repositoryOverlayRef.current = node; };
  const renderBranchOption = (branch: GitBranch) => {
    const current = branch.kind === "local"
      && (branch.current || (!snapshot?.head.detached && branch.name === snapshot?.head.name));
    const commit = snapshot?.commits.find((item) => item.oid === branch.oid);
    const branchName = `${branch.name}${snapshot?.head.unborn && branch.kind === "local" && branch.name === snapshot.head.name ? "（未提交）" : ""}`;
    const kindLabel = current ? "当前" : branch.kind === "remote" ? "远程" : "本地";
    return <button type="button" role="option" aria-selected={current} data-kind={branch.kind} key={branch.refName} title={branch.name} onClick={() => onSelectBranch(branch, current)}>
      <span className="git-branch-option-primary"><Icon name={branch.kind === "remote" ? "network" : "git"} size={12}/><strong>{branchName}</strong>{commit && <span className="git-branch-time">{formatRelativeCommitTime(commit.timestamp)}</span>}<span className="git-branch-kind">{kindLabel}</span></span>
      <span className="git-branch-option-meta">{commit?.author && <span className="git-branch-author" title={commit.author}>{commit.author}</span>}<span className="git-branch-oid" title={branch.oid}>{branch.oid.slice(0, 7)}</span>{commit?.subject && <span className="git-branch-subject" title={commit.subject}>{commit.subject}</span>}</span>
    </button>;
  };

  if (repositoryOverlay.kind === "branches") {
    return <div ref={overlayRef} className="git-repository-popover git-branch-popover" role="dialog" aria-label="切换分支" onKeyDown={onNavigateMenu} {...common}>
      <div className="git-branch-search-shell"><Icon name="search" size={12}/><input className="git-branch-search" type="search" role="searchbox" aria-label="筛选分支" value={branchQuery} placeholder="筛选要签出的分支" onChange={(event) => onBranchQueryChange(event.target.value)}/></div>
      <div className="git-branch-actions"><button type="button" onClick={() => onOpenOverlay("createBranch")}><Icon name="plus" size={12}/><span>创建新分支…</span></button></div>
      <div className="git-branch-list" role="listbox" aria-label="选择分支">
        <div className="git-branch-list-group" role="group" aria-label="本地分支"><div className="git-branch-list-header" role="presentation"><span>本地分支</span><span>{visibleLocalBranches.length}</span></div>{visibleLocalBranches.map(renderBranchOption)}</div>
        <div className="git-branch-list-group" role="group" aria-label="远程分支"><div className="git-branch-list-header" role="presentation"><span>远程分支</span><span>{visibleRemoteBranches.length}</span></div>{visibleRemoteBranches.map(renderBranchOption)}</div>
        {visibleBranches.length === 0 && <div className="git-branch-empty">没有匹配“{branchQuery.trim()}”的分支</div>}
      </div>
    </div>;
  }

  if (repositoryOverlay.kind === "createBranch") {
    return <form ref={overlayRef} className="git-repository-popover git-branch-create-popover" role="dialog" aria-label="新建分支" onSubmit={async (event) => {
      event.preventDefault();
      const name = newBranch.trim();
      if (!root || !name) return;
      if (await onCreateBranch(name)) { onNewBranchChange(""); onCloseOverlay(true); }
    }} {...common}>
      <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>新建分支</strong></div>
      <label htmlFor={`git-new-branch-${blockId}`}><RequiredFieldLabel>分支名称</RequiredFieldLabel></label>
      <input id={`git-new-branch-${blockId}`} aria-label="新分支名称" value={newBranch} autoFocus maxLength={255} placeholder="例如 feature/login" onChange={(event) => onNewBranchChange(event.target.value)}/>
      <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
      <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => onCloseOverlay(true)}>取消</button><button type="submit" disabled={disabled || !newBranch.trim()}>创建并切换</button></div>
    </form>;
  }

  if (repositoryOverlay.kind === "repositoryActions") {
    const tracked = Boolean(snapshot?.head.upstream);
    return <><div ref={overlayRef} className="git-repository-popover git-repository-action-popover" role="menu" aria-label="存储库操作" onKeyDown={onNavigateMenu} {...common}>
      <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>存储库操作</strong></div>
      <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !tracked} onPointerEnter={onDismissBranchSubmenu} onClick={onPull}><Icon name="download" size={12}/><span>拉取</span></button>
      {tracked
        ? <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress} onPointerEnter={onDismissBranchSubmenu} onClick={onPush}><Icon name="upload" size={12}/><span>推送</span></button>
        : <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !snapshot?.remotes.length} onPointerEnter={onDismissBranchSubmenu} onClick={() => onOpenOverlay("publishBranch")}><Icon name="upload" size={12}/><span>发布分支…</span></button>}
      <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !tracked} onPointerEnter={onDismissBranchSubmenu} onClick={onSynchronize}><Icon name="refresh" size={12}/><span>同步</span></button>
      <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || mergeSourceOptions.length === 0} onPointerEnter={onDismissBranchSubmenu} onClick={() => onOpenOverlay("mergeBranch")}><Icon name="git" size={12}/><span>合并分支…</span></button>
      <div className="git-repository-action-separator" role="separator"/>
      <button ref={branchManagementItemRef} type="button" className="git-repository-action-item" role="menuitem" disabled={mergeInProgress} aria-haspopup="menu" aria-expanded={Boolean(repositorySubmenu)} aria-controls={repositorySubmenuId} onPointerEnter={() => onOpenBranchSubmenu(false)} onKeyDown={(event) => {
        if (event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenBranchSubmenu(true);
      }} onClick={() => onOpenBranchSubmenu(true)}><Icon name="settings" size={12}/><span>本地分支管理…</span><small className="git-repository-submenu-indicator" aria-hidden="true">›</small></button>
      <button type="button" className="git-repository-action-item" role="menuitem" aria-label="操作记录" onPointerEnter={onDismissBranchSubmenu} onClick={() => onOpenOverlay("operationLog")}><Icon name="menu" size={12}/><span>操作记录</span><small>{operations.length}</small></button>
    </div>
    {repositorySubmenu && <div ref={(node) => { repositorySubmenuRef.current = node; }} id={repositorySubmenuId} className="git-repository-popover git-repository-action-popover git-repository-submenu" data-side={repositorySubmenu.side} style={{ left: repositorySubmenu.left, top: repositorySubmenu.top }} role="menu" aria-label="本地分支管理" onKeyDown={(event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        onCloseBranchSubmenu(true);
        return;
      }
      onNavigateMenu(event);
    }}>
      <div className="git-repository-popover-title"><Icon name="settings" size={13}/><strong>本地分支管理</strong></div>
      <button type="button" className="git-repository-action-item" role="menuitem" onClick={() => onOpenOverlay("createBranchFrom")}><Icon name="plus" size={12}/><span>从指定分支创建…</span></button>
      <button type="button" className="git-repository-action-item" role="menuitem" disabled={localBranchOptions.length === 0} onClick={() => onOpenOverlay("renameBranch")}><Icon name="edit" size={12}/><span>重命名本地分支…</span></button>
      <button type="button" className="git-repository-action-item danger" role="menuitem" disabled={deletableBranchOptions.length === 0} onClick={() => onOpenOverlay("deleteBranch")}><Icon name="trash" size={12}/><span>安全删除本地分支…</span></button>
    </div>}</>;
  }

  if (repositoryOverlay.kind === "operationLog") {
    return <div ref={overlayRef} className="git-repository-popover git-operation-popover" role="dialog" aria-label="Git 操作记录" {...common}>
      <div className="git-repository-popover-title"><Icon name="menu" size={13}/><strong>Git 操作记录</strong><span>{operations.length}/20</span></div>
      <div className="git-operation-list" role="list">
        {operations.map((record) => <div className="git-operation-row" data-status={record.status} role="listitem" key={record.id}>
          <span className="git-operation-status" aria-label={operationStatusLabel(record.status)}><Icon name={record.status === "success" ? "checkCircle" : record.status === "error" ? "clear" : record.status === "attention" ? "git" : "refresh"} size={11}/></span>
          <span><strong>{record.name}</strong><small title={record.detail}>{record.detail}</small></span>
          <time>{record.status === "running" ? "进行中" : `${record.durationMs ?? 0} ms`}</time>
        </div>)}
        {operations.length === 0 && <div className="git-operation-empty">当前尚无 Git 操作</div>}
      </div>
    </div>;
  }

  if (repositoryOverlay.kind === "mergeBranch") {
    const localSources = mergeSourceOptions.filter((branch) => branch.kind === "local");
    const remoteSources = mergeSourceOptions.filter((branch) => branch.kind === "remote");
    return <form ref={overlayRef} className="git-repository-popover git-branch-management-popover git-merge-popover" role="dialog" aria-label="合并分支" aria-hidden={mergeConfirmation ? true : undefined} inert={mergeConfirmation ? true : undefined} onSubmit={(event) => {
      event.preventDefault();
      if (!root || !mergeSourceRef || !selectedMergeSource || !mergeWorktreeClean || mergeInProgress) return;
      onMergeConfirmationChange({ sourceRef: mergeSourceRef, sourceName: selectedMergeSource.name, targetName: branchLabel });
    }} {...common}>
      <div className="git-repository-popover-title git-merge-popover-title" data-state={mergeWorktreeClean ? "ready" : "blocked"}>
        <Icon name="git" size={13}/>
        <span><strong>合并分支</strong><small>{mergeWorktreeClean ? "使用 Git 默认策略合并；不会自动 Fetch 或 Stash。" : "开始合并前请先提交或清理工作区更改。"}</small></span>
      </div>
      <div className="git-merge-flow" aria-label={`${selectedMergeSource?.name ?? "未选择"} → ${branchLabel}`}>
        <div className="git-merge-node git-merge-source-node" role="group" aria-label="源分支">
          <div className="git-merge-node-heading"><label className="git-merge-node-title" htmlFor={`git-merge-source-${blockId}`}><Icon name="git" size={12}/><RequiredFieldLabel>源分支</RequiredFieldLabel></label><span>{selectedMergeSource?.kind === "remote" ? "远程" : "本地"}</span></div>
          <div className="git-merge-branch-field git-merge-branch-field-select"><select id={`git-merge-source-${blockId}`} aria-label="源分支" required value={mergeSourceRef} onChange={(event) => onMergeSourceRefChange(event.target.value)}>
            {localSources.length > 0 && <optgroup label="本地分支">{localSources.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</optgroup>}
            {remoteSources.length > 0 && <optgroup label="远程分支">{remoteSources.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</optgroup>}
          </select><Icon name="chevronDown" size={11}/></div>
        </div>
        <div className="git-merge-flow-connector" aria-hidden="true"><span className="git-merge-flow-track"><span className="git-merge-flow-packet"/></span><Icon name="forward" size={12}/><span className="git-merge-flow-label">合并到</span></div>
        <div className="git-merge-node git-merge-target-node" role="group" aria-label="目标分支">
          <div className="git-merge-node-heading"><span className="git-merge-node-title"><Icon name="checkCircle" size={12}/><strong>目标分支</strong></span><span>当前</span></div>
          <div className="git-merge-branch-field"><output className="git-merge-branch-value" aria-label={`目标分支 ${branchLabel}`} title={branchLabel}>{branchLabel}</output></div>
        </div>
      </div>
      <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
      <div className="git-branch-create-actions git-merge-actions"><button type="button" className="secondary git-merge-cancel" onClick={() => onCloseOverlay(true)}>取消合并</button><button type="submit" disabled={disabled || mergeInProgress || !mergeWorktreeClean || !mergeSourceRef}>合并到 {branchLabel}</button></div>
    </form>;
  }

  if (repositoryOverlay.kind === "abortMerge") {
    return <form ref={overlayRef} className="git-repository-popover git-branch-management-popover git-merge-abort-popover" role="dialog" aria-label="中止合并" onSubmit={async (event) => {
      event.preventDefault();
      if (!root || !mergeInProgress) return;
      if (await onAbortMerge()) onCloseOverlay(true);
    }} {...common}>
      <div className="git-repository-popover-title"><Icon name="trash" size={13}/><strong>中止合并</strong></div>
      <p className="git-branch-management-danger">中止会恢复合并前状态，并可能放弃已经完成的冲突解决编辑。此操作不会执行额外 reset。</p>
      <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
      <div className="git-branch-create-actions"><button type="button" className="secondary" autoFocus onClick={() => onCloseOverlay(true)}>取消</button><button type="submit" className="danger" disabled={disabled || !mergeInProgress}>确认中止</button></div>
    </form>;
  }

  const formTitle = repositoryOverlay.kind === "createBranchFrom"
    ? "从指定分支创建"
    : repositoryOverlay.kind === "createBranchFromCommit"
      ? "从此提交创建分支"
    : repositoryOverlay.kind === "renameBranch"
      ? "重命名本地分支"
      : repositoryOverlay.kind === "deleteBranch"
        ? "安全删除本地分支"
        : "发布分支";
  const isDelete = repositoryOverlay.kind === "deleteBranch";
  return <form ref={overlayRef} className="git-repository-popover git-branch-management-popover" role="dialog" aria-label={formTitle} onSubmit={async (event) => {
    event.preventDefault();
    if (!root) return;
    let succeeded: boolean;
    if (repositoryOverlay.kind === "createBranchFrom") {
      const name = newBranch.trim();
      if (!name || !branchSourceRef) return;
      succeeded = await onCreateBranchAt(name, branchSourceRef);
    } else if (repositoryOverlay.kind === "createBranchFromCommit") {
      const name = newBranch.trim();
      if (!name || !commitBranchSource || mergeInProgress) return;
      succeeded = await onCreateBranchFromCommit(name, commitBranchSource.oid);
    } else if (repositoryOverlay.kind === "renameBranch") {
      const name = newBranch.trim();
      if (!name || !selectedBranchRef) return;
      succeeded = await onRenameBranch(selectedBranchRef, name);
    } else if (repositoryOverlay.kind === "deleteBranch") {
      if (!selectedBranchRef) return;
      succeeded = await onDeleteBranch(selectedBranchRef);
    } else {
      if (!selectedRemote) return;
      succeeded = await onPublishBranch(selectedRemote);
    }
    if (succeeded) onCloseOverlay(true);
  }} {...common}>
    <div className="git-repository-popover-title"><Icon name={isDelete ? "trash" : repositoryOverlay.kind === "publishBranch" ? "upload" : "git"} size={13}/><strong>{formTitle}</strong></div>
    {repositoryOverlay.kind === "createBranchFrom" && <>
      <label htmlFor={`git-branch-source-${blockId}`}><RequiredFieldLabel>起点分支</RequiredFieldLabel></label>
      <select id={`git-branch-source-${blockId}`} aria-label="起点分支" value={branchSourceRef} onChange={(event) => onBranchSourceRefChange(event.target.value)}>{branchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name} · {branch.kind === "local" ? "本地" : "远程"}</option>)}</select>
      <label htmlFor={`git-branch-from-name-${blockId}`}><RequiredFieldLabel>新分支名称</RequiredFieldLabel></label>
      <input id={`git-branch-from-name-${blockId}`} aria-label="新分支名称" value={newBranch} maxLength={255} autoFocus placeholder="例如 feature/login" onChange={(event) => onNewBranchChange(event.target.value)}/>
    </>}
    {repositoryOverlay.kind === "createBranchFromCommit" && commitBranchSource && <>
      <div className="git-commit-branch-source" aria-label={`起点提交 ${commitBranchSource.subject}`}><Icon name="git" size={13}/><span><strong title={commitBranchSource.subject}>{commitBranchSource.subject}</strong><code title={commitBranchSource.oid}>{commitBranchSource.oid.slice(0, 8)}</code></span></div>
      <label htmlFor={`git-branch-from-commit-name-${blockId}`}><RequiredFieldLabel>新分支名称</RequiredFieldLabel></label>
      <input id={`git-branch-from-commit-name-${blockId}`} aria-label="新分支名称" required value={newBranch} maxLength={255} autoFocus placeholder="例如 feature/history" onChange={(event) => onNewBranchChange(event.target.value)}/>
    </>}
    {repositoryOverlay.kind === "renameBranch" && <>
      <label htmlFor={`git-rename-ref-${blockId}`}><RequiredFieldLabel>本地分支</RequiredFieldLabel></label>
      <select id={`git-rename-ref-${blockId}`} aria-label="本地分支" value={selectedBranchRef} onChange={(event) => onSelectedBranchRefChange(event.target.value)}>{localBranchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}{branch.current ? " · 当前" : ""}</option>)}</select>
      <label htmlFor={`git-rename-name-${blockId}`}><RequiredFieldLabel>新分支名称</RequiredFieldLabel></label>
      <input id={`git-rename-name-${blockId}`} aria-label="新分支名称" value={newBranch} maxLength={255} autoFocus placeholder="例如 feature/new-name" onChange={(event) => onNewBranchChange(event.target.value)}/>
    </>}
    {repositoryOverlay.kind === "deleteBranch" && <>
      <label htmlFor={`git-delete-ref-${blockId}`}><RequiredFieldLabel>待删除分支</RequiredFieldLabel></label>
      <select id={`git-delete-ref-${blockId}`} aria-label="待删除分支" value={selectedBranchRef} onChange={(event) => onSelectedBranchRefChange(event.target.value)}>{deletableBranchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</select>
      <p className="git-branch-management-danger">仅执行安全删除；未合并分支会被 Git 拒绝，不提供强制删除。</p>
    </>}
    {repositoryOverlay.kind === "publishBranch" && <>
      <label htmlFor={`git-publish-remote-${blockId}`}><RequiredFieldLabel>目标 remote</RequiredFieldLabel></label>
      <select id={`git-publish-remote-${blockId}`} aria-label="目标 remote" value={selectedRemote} onChange={(event) => onSelectedRemoteChange(event.target.value)}>{snapshot?.remotes.map((remoteName) => <option value={remoteName} key={remoteName}>{remoteName}</option>)}</select>
      <p>将当前分支发布到同名远程分支并设置 upstream。</p>
    </>}
    <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
    <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => onCloseOverlay(true)}>取消</button><button type="submit" className={isDelete ? "danger" : undefined} disabled={disabled || (repositoryOverlay.kind === "createBranchFrom" ? !newBranch.trim() || !branchSourceRef : repositoryOverlay.kind === "createBranchFromCommit" ? !newBranch.trim() || !commitBranchSource || mergeInProgress : repositoryOverlay.kind === "renameBranch" ? !newBranch.trim() || !selectedBranchRef : repositoryOverlay.kind === "deleteBranch" ? !selectedBranchRef : !selectedRemote)}>{repositoryOverlay.kind === "createBranchFrom" || repositoryOverlay.kind === "createBranchFromCommit" ? "创建并切换" : repositoryOverlay.kind === "renameBranch" ? "重命名" : repositoryOverlay.kind === "deleteBranch" ? "确认安全删除" : "发布并设置 upstream"}</button></div>
  </form>;
}

function GitMergeConfirmationDialog({ mergeConfirmation, busy, error, onMergeConfirmationChange, onConfirmMerge }: GitRepositoryOverlaysProps) {
  if (!mergeConfirmation) return null;
  return <DialogFrame
    title="确认合并分支？"
    subtitle={`${mergeConfirmation.sourceName} → ${mergeConfirmation.targetName}`}
    className="git-merge-confirmation"
    scrimClassName="git-merge-confirmation-scrim"
    compact
    dismissible={busy !== "merge"}
    onClose={() => { if (busy !== "merge") onMergeConfirmationChange(null); }}
  >
    <form className="git-merge-confirmation-form" onSubmit={(event) => { event.preventDefault(); onConfirmMerge(); }}>
      <p className="confirm-copy git-merge-confirmation-copy">将把 <code>{mergeConfirmation.sourceName}</code> 的提交合并到当前分支 <code>{mergeConfirmation.targetName}</code>。若产生冲突，需要在当前工作区解决后继续或中止合并。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={error?.message ?? ""}/><div><Button data-dialog-autofocus disabled={busy === "merge"} onClick={() => onMergeConfirmationChange(null)}>返回</Button><Button type="submit" variant="primary" loading={busy === "merge"}>确认合并</Button></div></footer>
    </form>
  </DialogFrame>;
}
