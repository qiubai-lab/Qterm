import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import {
  commitGitChanges, createGitBranch, gitAvailable, gitError, initializeGitRepository,
  executeRemoteGit, loadGitCommitFiles, loadGitSnapshot, loadRemoteGitCommitFiles, selectGitRepositoryDirectory, stageAllGitChanges, stageGitPaths,
  switchGitBranch, unstageAllGitChanges, unstageGitPaths,
  type GitChange, type GitCommit, type GitCommitFile, type GitSnapshot, type RemoteGitAction,
} from "../lib/tauri/git";
import type { GitTarget } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { buildGitGraphRows, type GitGraphRow } from "./gitGraph";

interface GitPaneProps { blockId: string; target: GitTarget; runtime?: GitRuntime; visible: boolean; onTargetChange: (target: GitTarget) => void }

type GitRepositoryOverlayKind = "branches" | "createBranch" | "more";

interface GitRepositoryOverlay {
  kind: GitRepositoryOverlayKind;
  left: number;
  top: number;
  placement: "above" | "below";
}

interface GitCommitFilesState {
  status: "loading" | "ready" | "error";
  files: GitCommitFile[];
  message?: string;
}

function fitRepositoryOverlay(anchor: DOMRect, width: number, height: number): Omit<GitRepositoryOverlay, "kind"> {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

export function GitPane({ blockId, target, runtime, visible, onTargetChange }: GitPaneProps) {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null);
  const [localAvailable, setLocalAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [expandedCommitKey, setExpandedCommitKey] = useState<string | null>(null);
  const [commitFilesCache, setCommitFilesCache] = useState<Record<string, GitCommitFilesState>>({});
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [repositoryOverlay, setRepositoryOverlay] = useState<GitRepositoryOverlay | null>(null);
  const [collapsed, setCollapsed] = useState({ repository: false, changes: false, graph: true });
  const epoch = useRef(0);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const onTargetChangeRef = useRef(onTargetChange);
  const branchButtonRef = useRef<HTMLButtonElement>(null);
  const createBranchButtonRef = useRef<HTMLButtonElement>(null);
  const repositoryMenuButtonRef = useRef<HTMLButtonElement>(null);
  const repositoryOverlayRef = useRef<HTMLElement | null>(null);
  const repositoryPath = target.type === "unbound" ? null : target.path;
  const remote = target.type === "remote";
  const remoteProfileId = target.type === "remote" ? target.profileId : null;
  const remoteSessionId = runtime?.sessionId;
  const remoteStatus = runtime?.status;
  const remoteReady = !remote || runtime?.status === "connected";
  const available = remote ? true : localAvailable;

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  const applySnapshot = useCallback((next: GitSnapshot) => {
    setSnapshot(next);
    setError(null);
    if (next.repositoryPath !== repositoryPath && target.type !== "remote") onTargetChangeRef.current({ type: "local", path: next.repositoryPath });
  }, [repositoryPath, target.type]);

  const remoteExecute = useCallback((action: RemoteGitAction) => {
    if (!remote || !remoteProfileId || !remoteSessionId || remoteStatus !== "connected") return Promise.reject(new Error("远程 Git 连接尚未建立"));
    return executeRemoteGit(remoteSessionId, remoteProfileId, action);
  }, [remote, remoteProfileId, remoteSessionId, remoteStatus]);

  const loadSnapshot = useCallback((path: string) => remote ? remoteExecute({ type: "snapshot", path }) : loadGitSnapshot(path), [remote, remoteExecute]);
  const initialize = useCallback((path: string) => remote ? remoteExecute({ type: "initialize", path }) : initializeGitRepository(path), [remote, remoteExecute]);
  const stagePaths = useCallback((repository: string, paths: string[]) => remote ? remoteExecute({ type: "stage", repository, paths }) : stageGitPaths(repository, paths), [remote, remoteExecute]);
  const stageAll = useCallback((repository: string) => remote ? remoteExecute({ type: "stageAll", repository }) : stageAllGitChanges(repository), [remote, remoteExecute]);
  const unstagePaths = useCallback((repository: string, paths: string[]) => remote ? remoteExecute({ type: "unstage", repository, paths }) : unstageGitPaths(repository, paths), [remote, remoteExecute]);
  const unstageAll = useCallback((repository: string) => remote ? remoteExecute({ type: "unstageAll", repository }) : unstageAllGitChanges(repository), [remote, remoteExecute]);
  const commit = useCallback((repository: string, message: string) => remote ? remoteExecute({ type: "commit", repository, message }) : commitGitChanges(repository, message), [remote, remoteExecute]);
  const createBranch = useCallback((repository: string, name: string) => remote ? remoteExecute({ type: "createBranch", repository, name }) : createGitBranch(repository, name), [remote, remoteExecute]);
  const switchBranch = useCallback((repository: string, name: string) => remote ? remoteExecute({ type: "switchBranch", repository, name }) : switchGitBranch(repository, name), [remote, remoteExecute]);

  const refresh = useCallback(async () => {
    if (!repositoryPath || !visible || !remoteReady) return;
    const request = ++epoch.current;
    setBusy("refresh");
    try {
      const next = await loadSnapshot(repositoryPath);
      if (request === epoch.current) applySnapshot(next);
    } catch (cause) {
      if (request === epoch.current) { setSnapshot(null); setError(gitError(cause)); }
    } finally {
      if (request === epoch.current) setBusy("");
    }
  }, [applySnapshot, loadSnapshot, remoteReady, repositoryPath, visible]);

  useEffect(() => {
    if (remote) return;
    void gitAvailable().then(setLocalAvailable, () => setLocalAvailable(false));
  }, [remote]);
  useEffect(() => {
    if (!visible || !available) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [available, refresh, visible]);
  useEffect(() => {
    if (!visible) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, visible]);
  useLayoutEffect(() => {
    const textarea = messageRef.current;
    if (!textarea) return;
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 16;
    const chrome = [styles.paddingTop, styles.paddingBottom, styles.borderTopWidth, styles.borderBottomWidth]
      .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
    const minimumHeight = Math.max(28, Math.ceil(lineHeight + chrome));
    const maximumHeight = Math.min(92, Math.ceil(lineHeight * 5 + chrome));
    textarea.style.height = "auto";
    const contentHeight = Math.max(textarea.scrollHeight, minimumHeight);
    textarea.style.height = `${Math.min(contentHeight, maximumHeight)}px`;
    textarea.style.overflowY = contentHeight > maximumHeight ? "auto" : "hidden";
  }, [message]);

  async function selectDirectory() {
    const path = await selectGitRepositoryDirectory(repositoryPath);
    if (!path) return;
    epoch.current += 1;
    setSnapshot(null); setError(null); onTargetChange({ type: "local", path });
  }

  function changeRepository() {
    setRepositoryOverlay(null);
    if (target.type === "remote") {
      setPathDraft(target.path);
      setEditingPath(true);
      return;
    }
    void selectDirectory();
  }

  async function mutate(label: string, operation: () => Promise<GitSnapshot>, clearMessage = false): Promise<boolean> {
    const request = ++epoch.current;
    setBusy(label); setError(null);
    try {
      const next = await operation();
      if (request !== epoch.current) return false;
      applySnapshot(next);
      if (clearMessage) setMessage("");
      return true;
    } catch (cause) {
      if (request === epoch.current) setError(gitError(cause));
      return false;
    } finally {
      if (request === epoch.current) setBusy("");
    }
  }

  function toggleExclusiveSection(section: "changes" | "graph") {
    setCollapsed((value) => {
      if (!value[section]) return { ...value, [section]: true };
      return section === "changes"
        ? { ...value, changes: false, graph: true }
        : { ...value, changes: true, graph: false };
    });
  }

  const staged = useMemo(() => snapshot?.changes.filter((change) => change.staged) ?? [], [snapshot]);
  const unstaged = useMemo(() => snapshot?.changes.filter((change) => !change.staged && !change.conflict) ?? [], [snapshot]);
  const conflicts = useMemo(() => snapshot?.changes.filter((change) => change.conflict) ?? [], [snapshot]);
  const graphRows = useMemo(() => buildGitGraphRows(snapshot?.commits ?? []), [snapshot]);
  const activeCommitOid = selectedCommitOid && snapshot?.commits.some((commit) => commit.oid === selectedCommitOid)
    ? selectedCommitOid
    : snapshot?.head.oid ?? null;
  const root = snapshot?.repositoryPath ?? repositoryPath;
  const disabled = Boolean(busy) || !remoteReady;
  const branchLabel = snapshot?.head.detached ? "detached HEAD" : snapshot?.head.name ?? "未命名分支";
  const branchOptions = useMemo(() => {
    if (!snapshot) return [];
    if (!snapshot.head.unborn || !snapshot.head.name || snapshot.branches.some((branch) => branch.name === snapshot.head.name)) return snapshot.branches;
    return [{ name: snapshot.head.name, oid: snapshot.head.oid ?? "", current: true, upstream: snapshot.head.upstream }, ...snapshot.branches];
  }, [snapshot]);
  const visibleBranches = useMemo(() => {
    const query = branchQuery.trim().toLocaleLowerCase();
    if (!query) return branchOptions;
    return branchOptions.filter((branch) => {
      const commit = snapshot?.commits.find((item) => item.oid === branch.oid);
      return [branch.name, branch.upstream, branch.oid, commit?.author, commit?.subject]
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [branchOptions, branchQuery, snapshot?.commits]);

  function commitFilesKey(oid: string): string | null {
    if (!root) return null;
    return JSON.stringify([remote ? "remote" : "local", remoteProfileId ?? "", root, oid]);
  }

  async function requestCommitFiles(commitToLoad: GitCommit, force = false) {
    const repository = root;
    const key = commitFilesKey(commitToLoad.oid);
    if (!repository || !key || (!force && ["loading", "ready"].includes(commitFilesCache[key]?.status))) return;
    setCommitFilesCache((value) => ({ ...value, [key]: { status: "loading", files: value[key]?.files ?? [] } }));
    try {
      const files = remote
        ? remoteProfileId && remoteSessionId && remoteStatus === "connected"
          ? await loadRemoteGitCommitFiles(remoteSessionId, remoteProfileId, repository, commitToLoad.oid)
          : await Promise.reject(new Error("远程 Git 连接尚未建立"))
        : await loadGitCommitFiles(repository, commitToLoad.oid);
      setCommitFilesCache((value) => ({ ...value, [key]: { status: "ready", files } }));
    } catch (cause) {
      setCommitFilesCache((value) => ({ ...value, [key]: { status: "error", files: [], message: gitError(cause).message } }));
    }
  }

  function toggleCommitFiles(commitToToggle: GitCommit) {
    const key = commitFilesKey(commitToToggle.oid);
    if (!key) return;
    setSelectedCommitOid(commitToToggle.oid);
    if (expandedCommitKey === key) {
      setExpandedCommitKey(null);
      return;
    }
    setExpandedCommitKey(key);
    void requestCommitFiles(commitToToggle);
  }

  function repositoryAnchor(kind: GitRepositoryOverlayKind): HTMLButtonElement | null {
    if (kind === "branches") return branchButtonRef.current;
    if (kind === "createBranch") return createBranchButtonRef.current;
    return repositoryMenuButtonRef.current;
  }

  function closeRepositoryOverlay(restoreFocus = false) {
    const anchor = repositoryOverlay ? repositoryAnchor(repositoryOverlay.kind) : null;
    setRepositoryOverlay(null);
    if (restoreFocus) window.requestAnimationFrame(() => anchor?.focus());
  }

  function openRepositoryOverlay(kind: GitRepositoryOverlayKind) {
    if (repositoryOverlay?.kind === kind) {
      closeRepositoryOverlay(true);
      return;
    }
    const anchor = repositoryAnchor(kind);
    if (!anchor) return;
    if (kind === "createBranch") {
      setNewBranch("");
      setError(null);
    }
    if (kind === "branches") setBranchQuery("");
    const estimatedWidth = kind === "createBranch" ? 270 : kind === "branches" ? 336 : 170;
    const estimatedHeight = kind === "createBranch" ? 138 : kind === "branches" ? Math.min(376, 92 + branchOptions.length * 44) : 38;
    setRepositoryOverlay({ kind, ...fitRepositoryOverlay(anchor.getBoundingClientRect(), estimatedWidth, estimatedHeight) });
  }

  useLayoutEffect(() => {
    if (!repositoryOverlay || !repositoryOverlayRef.current) return;
    const anchor = repositoryOverlay.kind === "branches"
      ? branchButtonRef.current
      : repositoryOverlay.kind === "createBranch" ? createBranchButtonRef.current : repositoryMenuButtonRef.current;
    if (!anchor) return;
    const overlay = repositoryOverlayRef.current;
    const next = fitRepositoryOverlay(anchor.getBoundingClientRect(), overlay.offsetWidth, overlay.offsetHeight);
    setRepositoryOverlay((current) => {
      if (current?.kind !== repositoryOverlay.kind) return current;
      if (current.left === next.left && current.top === next.top && current.placement === next.placement) return current;
      return { ...current, ...next };
    });
  }, [repositoryOverlay, visibleBranches.length]);

  useEffect(() => {
    if (!repositoryOverlay) return;
    const anchor = repositoryOverlay.kind === "branches"
      ? branchButtonRef.current
      : repositoryOverlay.kind === "createBranch" ? createBranchButtonRef.current : repositoryMenuButtonRef.current;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!repositoryOverlayRef.current?.contains(node) && !anchor?.contains(node)) setRepositoryOverlay(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRepositoryOverlay(null);
      window.requestAnimationFrame(() => anchor?.focus());
    };
    const closeOnViewportChange = () => setRepositoryOverlay(null);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    if (repositoryOverlay.kind === "branches") window.requestAnimationFrame(() => repositoryOverlayRef.current?.querySelector<HTMLInputElement>('.git-branch-search')?.focus());
    else if (repositoryOverlay.kind === "more") window.requestAnimationFrame(() => repositoryOverlayRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [repositoryOverlay]);

  function navigateRepositoryMenu(event: React.KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"]'));
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items[items.length - 1].focus();
    else if (event.key === "ArrowDown") items[(current + 1 + items.length) % items.length].focus();
    else items[(current - 1 + items.length) % items.length].focus();
  }

  if (available === false) return <GitEmpty icon="git" title="未找到系统 Git" detail="安装 Git 并重新打开 Qterm 后即可使用 Git 管理。"/>;
  if (!repositoryPath) return <GitEmpty icon="git" title="选择本机仓库" detail="Git Block 一次管理一个本机或 SSH 工作区仓库。" action="选择文件夹" onAction={() => void selectDirectory()}/>;
  if (remote && editingPath && target.type === "remote") return <form className="git-target-config" onSubmit={(event) => { event.preventDefault(); const path = pathDraft.trim(); if (!path) return; setSnapshot(null); setError(null); setEditingPath(false); onTargetChange({ ...target, path }); }}>
    <Icon name="git" size={28}/><strong>更换远程仓库路径</strong><span>仅切换当前 Git Block；不会修改或移动服务器上的目录。</span>
    <label htmlFor={`git-path-${blockId}`}><RequiredFieldLabel>远程仓库路径</RequiredFieldLabel></label>
    <input id={`git-path-${blockId}`} required value={pathDraft} autoFocus maxLength={4096} placeholder="/srv/project" onChange={(event) => setPathDraft(event.target.value)}/>
    <div><button type="button" className="secondary" onClick={() => setEditingPath(false)}>取消</button><button type="submit" disabled={!pathDraft.trim()}>应用路径</button></div>
  </form>;
  if (remote && !remoteReady && !snapshot) return <GitEmpty icon="git" title={runtime?.status === "connecting" || runtime?.status === "authenticating" ? "正在连接远程 Git…" : "远程 Git 尚未连接"} detail={runtime?.notice || repositoryPath} secondary="更换远程路径" onSecondary={() => { setPathDraft(repositoryPath); setEditingPath(true); }}/>;
  if (error?.code === "notGitRepository") return <GitEmpty icon="git" title="尚未初始化存储库" detail={repositoryPath} action="初始化存储库" secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void mutate("initialize", () => initialize(repositoryPath))} onSecondary={remote ? () => { setPathDraft(repositoryPath); setEditingPath(true); } : () => void selectDirectory()}/>;
  if (error && !snapshot) return <GitEmpty icon="git" title={gitFailureTitle(error.code)} detail={error.message} action={error.code === "gitMissing" || error.code === "gitUnsupportedRemote" ? undefined : "重试"} secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void refresh()} onSecondary={remote ? () => { setPathDraft(repositoryPath); setEditingPath(true); } : () => void selectDirectory()}/>;

  return <><div className="git-pane" data-block-id={blockId} data-busy={disabled || undefined} aria-busy={disabled}>
    <GitSection className="git-repository-section" title="存储库" meta={root ?? repositoryPath} collapsed={collapsed.repository} onToggle={() => setCollapsed((value) => ({ ...value, repository: !value.repository }))}>
      <div className="git-repository-row">
        <Icon name="git" size={15}/><span className="git-repository-name">{snapshot?.repositoryName ?? repositoryPath}</span>
        {snapshot && <button ref={branchButtonRef} type="button" className="git-branch-trigger" aria-label={`切换分支，当前 ${branchLabel}`} title={`切换分支 · ${branchLabel}`} aria-haspopup="dialog" aria-expanded={repositoryOverlay?.kind === "branches"} disabled={disabled} onClick={() => openRepositoryOverlay("branches")}>
          <Icon name="git" size={12}/><span>{branchLabel}</span>
        </button>}
        <div className="git-repository-actions">
          <button ref={createBranchButtonRef} type="button" aria-label="创建分支" title="创建分支" aria-haspopup="dialog" aria-expanded={repositoryOverlay?.kind === "createBranch"} disabled={disabled || !snapshot} onClick={() => openRepositoryOverlay("createBranch")}><Icon name="plus" size={12}/></button>
          <button type="button" aria-label="刷新 Git 状态" title="刷新" disabled={disabled} onClick={() => void refresh()}><Icon name="refresh" size={13}/></button>
          <div className="git-repository-menu">
            <button ref={repositoryMenuButtonRef} type="button" aria-label="更多存储库操作" title="更多操作" aria-haspopup="menu" aria-expanded={repositoryOverlay?.kind === "more"} onClick={() => openRepositoryOverlay("more")}><Icon name="more" size={13}/></button>
          </div>
        </div>
      </div>
      {remote && runtime?.stale && <div className="git-feedback stale" role="status">连接已断开，当前内容可能已过期；重新连接后将自动刷新。</div>}
      {snapshot?.head.upstream && <div className="git-upstream">{snapshot.head.upstream} · ↑{snapshot.head.ahead} ↓{snapshot.head.behind}</div>}
    </GitSection>

    <GitSection className="git-changes-section" title={`更改${snapshot ? ` ${snapshot.changes.length}` : ""}`} collapsed={collapsed.changes} onToggle={() => toggleExclusiveSection("changes")} actions={<>
      <button type="button" aria-label="暂存全部更改" title="暂存全部" disabled={disabled || !root || unstaged.length + conflicts.length === 0} onClick={() => root && void mutate("stageAll", () => stageAll(root))}><Icon name="plus" size={12}/></button>
      <button type="button" aria-label="取消暂存全部更改" title="取消暂存全部" disabled={disabled || !root || staged.length === 0} onClick={() => root && void mutate("unstageAll", () => unstageAll(root))}><Icon name="clear" size={12}/></button>
    </>}>
      <div className="git-commit-box">
        <textarea ref={messageRef} aria-label="提交消息" rows={1} data-max-rows="5" value={message} maxLength={10_000} placeholder="提交消息" onChange={(event) => setMessage(event.target.value)}/>
        <button type="button" className="git-commit-button" disabled={disabled || !root || !message.trim() || staged.length === 0} onClick={() => root && void mutate("commit", () => commit(root, message.trim()), true)}>提交</button>
      </div>
      {error && <div className="git-feedback" role="alert">{error.message}</div>}
      <div className="git-change-scroll" role="list" aria-label="Git 更改">
        {conflicts.length > 0 && <GitChangeList title="冲突" changes={conflicts} actionLabel="暂存已解决文件" onAction={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}/>}
        {staged.length > 0 && <GitChangeList title="暂存的更改" changes={staged} actionLabel="取消暂存" onAction={(change) => root && void mutate("unstage", () => unstagePaths(root, [change.path]))}/>}
        {unstaged.length > 0 && <GitChangeList title="更改" changes={unstaged} actionLabel="暂存" onAction={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}/>}
        {snapshot && snapshot.changes.length === 0 && <div className="git-clean-state"><Icon name="checkCircle" size={16}/>工作区干净</div>}
        {!snapshot && !error && <div className="git-clean-state">正在读取仓库…</div>}
      </div>
    </GitSection>

    <GitSection className="git-graph-section" title="图表" collapsed={collapsed.graph} onToggle={() => toggleExclusiveSection("graph")}>
      <div className="git-graph-scroll" role="list" aria-label="提交图表">
        {snapshot?.commits.map((commit, index) => {
          const cacheKey = commitFilesKey(commit.oid);
          const expanded = cacheKey === expandedCommitKey;
          return <div className="git-commit-entry" role="listitem" key={commit.oid}>
            <button type="button" className="git-commit-row" aria-pressed={commit.oid === activeCommitOid} aria-expanded={expanded} title={`${commit.subject} · ${formatCommitTime(commit.timestamp)}`} onClick={() => toggleCommitFiles(commit)}>
              <GitGraph row={graphRows[index]}/>
              <span className="git-commit-content"><span className="git-commit-summary"><span className="git-commit-expander"><Icon name="chevronDown" size={9}/></span><span className="git-commit-subject">{commit.subject}</span>{commit.decorations.length > 0 && <span className="git-decorations">{commit.decorations.slice(0, 3).map((decoration) => <span data-kind={gitDecorationKind(decoration)} key={decoration}><Icon name={decoration.includes("origin/") ? "network" : "git"} size={9}/>{formatGitDecoration(decoration)}</span>)}</span>}</span><span className="git-commit-meta"><span>{commit.author}</span><span>{formatRelativeCommitTime(commit.timestamp)}</span><span>{commit.oid.slice(0, 7)}</span></span></span>
            </button>
            {expanded && <GitCommitFiles commit={commit} state={cacheKey ? commitFilesCache[cacheKey] : undefined} onRetry={() => void requestCommitFiles(commit, true)}/>}
          </div>;
        })}
        {snapshot && snapshot.commits.length === 0 && <div className="git-clean-state">提交后将在这里显示分支图</div>}
      </div>
    </GitSection>
  </div>
    {visible && repositoryOverlay && createPortal(repositoryOverlay.kind === "createBranch"
      ? <form ref={(node) => { repositoryOverlayRef.current = node; }} className="git-repository-popover git-branch-create-popover" data-placement={repositoryOverlay.placement} role="dialog" aria-label="新建分支" style={{ left: repositoryOverlay.left, top: repositoryOverlay.top }} onSubmit={async (event) => {
        event.preventDefault();
        const name = newBranch.trim();
        if (!root || !name) return;
        const succeeded = await mutate("branch", () => createBranch(root, name));
        if (succeeded) {
          setNewBranch("");
          closeRepositoryOverlay(true);
        }
      }}>
        <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>新建分支</strong></div>
        <label htmlFor={`git-new-branch-${blockId}`}><RequiredFieldLabel>分支名称</RequiredFieldLabel></label>
        <input id={`git-new-branch-${blockId}`} aria-label="新分支名称" value={newBranch} autoFocus maxLength={255} placeholder="例如 feature/login" onChange={(event) => setNewBranch(event.target.value)}/>
        <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
        <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => closeRepositoryOverlay(true)}>取消</button><button type="submit" disabled={disabled || !newBranch.trim()}>创建并切换</button></div>
      </form>
      : repositoryOverlay.kind === "branches"
        ? <div ref={(node) => { repositoryOverlayRef.current = node; }} className="git-repository-popover git-branch-popover" data-placement={repositoryOverlay.placement} role="dialog" aria-label="切换分支" style={{ left: repositoryOverlay.left, top: repositoryOverlay.top }} onKeyDown={navigateRepositoryMenu}>
          <div className="git-branch-search-shell"><Icon name="search" size={12}/><input className="git-branch-search" type="search" role="searchbox" aria-label="筛选分支" value={branchQuery} placeholder="筛选要签出的分支" onChange={(event) => setBranchQuery(event.target.value)}/></div>
          <div className="git-branch-actions"><button type="button" onClick={() => openRepositoryOverlay("createBranch")}><Icon name="plus" size={12}/><span>创建新分支…</span></button></div>
          <div className="git-branch-list-header"><span>分支</span><span>{visibleBranches.length}</span></div>
          <div className="git-branch-list" role="listbox" aria-label="选择分支">
            {visibleBranches.map((branch) => {
              const current = branch.current || (!snapshot?.head.detached && branch.name === snapshot?.head.name);
              const commit = snapshot?.commits.find((item) => item.oid === branch.oid);
              const branchName = `${branch.name}${snapshot?.head.unborn && branch.name === snapshot.head.name ? "（未提交）" : ""}`;
              return <button type="button" role="option" aria-selected={current} key={branch.name} title={branch.name} onClick={() => {
                closeRepositoryOverlay(false);
                if (root && !current) void mutate("switch", () => switchBranch(root, branch.name));
              }}>
                <span className="git-branch-option-primary"><Icon name="git" size={12}/><strong>{branchName}</strong>{commit && <span className="git-branch-time">{formatRelativeCommitTime(commit.timestamp)}</span>}<span className="git-branch-kind">{current ? "当前" : "分支"}</span></span>
                <span className="git-branch-option-meta">{commit?.author && <span>{commit.author}</span>}<span>{branch.oid.slice(0, 7)}</span>{commit?.subject && <span>{commit.subject}</span>}{branch.upstream && <span className="git-branch-upstream"><Icon name="network" size={10}/>{branch.upstream}</span>}</span>
              </button>;
            })}
            {visibleBranches.length === 0 && <div className="git-branch-empty">没有匹配“{branchQuery.trim()}”的分支</div>}
          </div>
        </div>
        : <div ref={(node) => { repositoryOverlayRef.current = node; }} className="git-repository-popover git-repository-menu-popover" data-placement={repositoryOverlay.placement} role="menu" aria-label="存储库操作" style={{ left: repositoryOverlay.left, top: repositoryOverlay.top }} onKeyDown={navigateRepositoryMenu}>
          <button type="button" role="menuitem" onClick={changeRepository}><Icon name="files" size={13}/><span>{remote ? "更换远程仓库路径" : "更换本机仓库"}</span></button>
        </div>, document.body)}
  </>;
}

function GitGraph({ row }: { row: GitGraphRow }) {
  const laneGap = 11;
  const centerY = 17;
  const width = row.laneCount * laneGap + 6;
  const x = (lane: number) => lane * laneGap + 7;
  return <span className="git-graph-rail"><svg className="git-graph-lanes" aria-hidden="true" width={width} height="34" viewBox={`0 0 ${width} 34`}>
    {row.incoming && <path d={`M ${x(row.currentLane)} 0 L ${x(row.currentLane)} ${centerY}`}/>}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.from}:${segment.to}:${index}`} data-kind={segment.kind} d={segment.kind === "through"
      ? `M ${x(segment.from)} 0 L ${x(segment.to)} 34`
      : `M ${x(segment.from)} ${centerY} C ${x(segment.from)} 24, ${x(segment.to)} 27, ${x(segment.to)} 34`}/>) }
    <circle cx={x(row.currentLane)} cy={centerY} r="4"/>
  </svg></span>;
}

function GitSection({ title, meta, collapsed, onToggle, actions, className = "", children }: { title: string; meta?: string | null; collapsed: boolean; onToggle: () => void; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`git-section ${className}${collapsed ? " collapsed" : ""}`} data-collapsed={collapsed}>
    <header className="git-section-header"><button type="button" className="git-section-toggle" aria-expanded={!collapsed} onClick={onToggle}><Icon name="chevronDown" size={10}/><span className="git-section-title">{title}</span>{meta && <span className="git-section-meta" aria-hidden="true" title={meta}>{meta}</span>}</button>{actions && <div className="git-section-actions">{actions}</div>}</header>
    <div className="git-section-body" aria-hidden={collapsed} inert={collapsed || undefined}><div className="git-section-content">{children}</div></div>
  </section>;
}

function GitChangeList({ title, changes, actionLabel, onAction }: { title: string; changes: GitChange[]; actionLabel: string; onAction: (change: GitChange) => void }) {
  const visible = changes.slice(0, 500);
  return <section className="git-change-group" aria-label={title}><div className="git-change-group-title">{title}<span>{changes.length}</span></div>{visible.map((change) => <div className="git-change-row" role="listitem" key={`${change.path}:${change.staged}:${change.status}`} title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}>
    <Icon name="file" size={13}/><span className="git-change-path">{change.path}</span><span className={`git-change-status${change.conflict ? " conflict" : ""}`}>{change.status}</span><button type="button" aria-label={`${actionLabel} ${change.path}`} title={actionLabel} onClick={() => onAction(change)}><Icon name={change.staged ? "clear" : "plus"} size={11}/></button>
  </div>)}{changes.length > visible.length && <div className="git-list-limit">另有 {changes.length - visible.length} 项，请使用终端处理后刷新</div>}</section>;
}

function GitCommitFiles({ commit, state, onRetry }: { commit: GitCommit; state?: GitCommitFilesState; onRetry: () => void }) {
  if (!state || state.status === "loading") return <div className="git-commit-files-state" role="status"><span className="git-commit-files-spinner"/>正在读取提交文件…</div>;
  if (state.status === "error") return <div className="git-commit-files-state error" role="alert"><span>{state.message ?? "无法读取提交文件"}</span><button type="button" onClick={onRetry}>重试</button></div>;
  if (state.files.length === 0) return <div className="git-commit-files-state empty" role="status">该提交没有可显示的文件变更</div>;
  const visible = state.files.slice(0, 500);
  return <div className="git-commit-files" role="list" aria-label={`${commit.subject} 的文件`}>
    {visible.map((file) => {
      const path = splitGitFilePath(file.path);
      const status = commitFileStatus(file.status);
      return <div className="git-commit-file-row" role="listitem" key={`${file.status}:${file.originalPath ?? ""}:${file.path}`} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
        <Icon name="file" size={12}/>
        <span className="git-commit-file-path"><span>{path.name}</span>{path.directory && <span className="git-commit-file-directory">{path.directory}</span>}{file.originalPath && <span className="git-commit-file-original">来自 {file.originalPath}</span>}</span>
        <span className="git-commit-file-status" data-tone={status.tone} title={status.label}>{status.short}</span>
      </div>;
    })}
    {state.files.length > visible.length && <div className="git-list-limit">另有 {state.files.length - visible.length} 个文件未显示</div>}
  </div>;
}

function splitGitFilePath(path: string): { name: string; directory: string } {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator < 0 ? { name: path, directory: "" } : { name: path.slice(separator + 1), directory: path.slice(0, separator) };
}

function commitFileStatus(status: string): { short: string; label: string; tone: string } {
  const short = status.charAt(0).toUpperCase() || "?";
  if (short === "A") return { short, label: "新增", tone: "added" };
  if (short === "M") return { short, label: "修改", tone: "modified" };
  if (short === "D") return { short, label: "删除", tone: "deleted" };
  if (short === "R") return { short, label: "重命名", tone: "renamed" };
  if (short === "C") return { short, label: "复制", tone: "copied" };
  if (short === "T") return { short, label: "类型变更", tone: "modified" };
  if (short === "U") return { short, label: "冲突", tone: "conflict" };
  return { short, label: status || "未知状态", tone: "default" };
}

function GitEmpty({ icon, title, detail, action, secondary, onAction, onSecondary }: { icon: "git"; title: string; detail: string; action?: string; secondary?: string; onAction?: () => void; onSecondary?: () => void }) {
  return <div className="git-empty"><Icon name={icon} size={28}/><strong>{title}</strong><span>{detail}</span><div>{action && <button type="button" onClick={onAction}>{action}</button>}{secondary && <button type="button" className="secondary" onClick={onSecondary}>{secondary}</button>}</div></div>;
}

function formatCommitTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
}

function formatRelativeCommitTime(timestamp: number): string {
  if (!timestamp) return "";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (elapsed < 60) return "刚刚";
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)} 分钟前`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3_600)} 小时前`;
  if (elapsed < 2_592_000) return `${Math.floor(elapsed / 86_400)} 天前`;
  if (elapsed < 31_536_000) return `${Math.floor(elapsed / 2_592_000)} 个月前`;
  return `${Math.floor(elapsed / 31_536_000)} 年前`;
}

function formatGitDecoration(decoration: string): string {
  return decoration.replace(/^HEAD -> /, "").replace(/^tag: /, "");
}

function gitDecorationKind(decoration: string): "head" | "remote" | "tag" | "branch" {
  if (decoration.startsWith("HEAD -> ")) return "head";
  if (decoration.startsWith("tag: ")) return "tag";
  if (decoration.includes("origin/")) return "remote";
  return "branch";
}

function gitFailureTitle(code: string): string {
  if (code === "gitMissing") return "远程主机未安装 Git";
  if (code === "gitUnsupportedRemote") return "远程环境不受支持";
  if (code === "gitPermissionDenied") return "无法访问远程仓库";
  if (code === "gitSessionUnavailable") return "远程 Git 连接已中断";
  return "无法读取 Git 仓库";
}
