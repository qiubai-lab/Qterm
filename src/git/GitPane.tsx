import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import {
  commitGitChanges, createGitBranch, gitAvailable, gitError, initializeGitRepository,
  executeRemoteGit, loadGitSnapshot, selectGitRepositoryDirectory, stageAllGitChanges, stageGitPaths,
  switchGitBranch, unstageAllGitChanges, unstageGitPaths,
  type GitChange, type GitSnapshot, type RemoteGitAction,
} from "../lib/tauri/git";
import type { GitTarget } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { buildGitGraphRows, type GitGraphRow } from "./gitGraph";

interface GitPaneProps { blockId: string; target: GitTarget; runtime?: GitRuntime; visible: boolean; onTargetChange: (target: GitTarget) => void }

export function GitPane({ blockId, target, runtime, visible, onTargetChange }: GitPaneProps) {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null);
  const [localAvailable, setLocalAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [collapsed, setCollapsed] = useState({ repository: false, changes: false, graph: false });
  const epoch = useRef(0);
  const repositoryPath = target.type === "unbound" ? null : target.path;
  const remote = target.type === "remote";
  const remoteReady = !remote || runtime?.status === "connected";
  const available = remote ? true : localAvailable;

  const applySnapshot = useCallback((next: GitSnapshot) => {
    setSnapshot(next);
    setError(null);
    if (next.repositoryPath !== repositoryPath && target.type !== "remote") onTargetChange({ type: "local", path: next.repositoryPath });
  }, [onTargetChange, repositoryPath, target]);

  const remoteExecute = useCallback((action: RemoteGitAction) => {
    if (target.type !== "remote" || !runtime?.sessionId || runtime.status !== "connected") return Promise.reject(new Error("远程 Git 连接尚未建立"));
    return executeRemoteGit(runtime.sessionId, target.profileId, action);
  }, [runtime, target]);

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

  async function selectDirectory() {
    const path = await selectGitRepositoryDirectory(repositoryPath);
    if (!path) return;
    epoch.current += 1;
    setSnapshot(null); setError(null); onTargetChange({ type: "local", path });
  }

  async function mutate(label: string, operation: () => Promise<GitSnapshot>, clearMessage = false) {
    const request = ++epoch.current;
    setBusy(label); setError(null);
    try {
      const next = await operation();
      if (request !== epoch.current) return;
      applySnapshot(next);
      if (clearMessage) setMessage("");
    } catch (cause) {
      if (request === epoch.current) setError(gitError(cause));
    } finally {
      if (request === epoch.current) setBusy("");
    }
  }

  const staged = useMemo(() => snapshot?.changes.filter((change) => change.staged) ?? [], [snapshot]);
  const unstaged = useMemo(() => snapshot?.changes.filter((change) => !change.staged && !change.conflict) ?? [], [snapshot]);
  const conflicts = useMemo(() => snapshot?.changes.filter((change) => change.conflict) ?? [], [snapshot]);
  const graphRows = useMemo(() => buildGitGraphRows(snapshot?.commits ?? []), [snapshot]);
  const root = snapshot?.repositoryPath ?? repositoryPath;
  const disabled = Boolean(busy) || !remoteReady;

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

  return <div className="git-pane" data-block-id={blockId} data-busy={disabled || undefined} aria-busy={disabled}>
    <GitSection title="存储库" collapsed={collapsed.repository} onToggle={() => setCollapsed((value) => ({ ...value, repository: !value.repository }))} actions={<>
      <button type="button" aria-label="更换仓库" title="更换仓库" onClick={() => remote ? (setPathDraft(repositoryPath), setEditingPath(true)) : void selectDirectory()}><Icon name="files" size={13}/></button>
      <button type="button" aria-label="刷新 Git 状态" title="刷新" disabled={disabled} onClick={() => void refresh()}><Icon name="refresh" size={13}/></button>
    </>}>
      <div className="git-repository-row">
        <Icon name="git" size={15}/><span className="git-repository-name">{snapshot?.repositoryName ?? repositoryPath}</span>
        {snapshot && <select aria-label="当前分支" value={snapshot.head.name ?? ""} disabled={disabled || snapshot.head.detached} onChange={(event) => root && void mutate("switch", () => switchBranch(root, event.target.value))}>
          {snapshot.head.detached && <option value="">detached HEAD</option>}
          {snapshot.head.unborn && snapshot.head.name && <option value={snapshot.head.name}>{snapshot.head.name}（未提交）</option>}
          {snapshot.branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
        </select>}
        <button type="button" aria-label="创建分支" title="创建分支" disabled={disabled || !snapshot} onClick={() => setCreatingBranch((value) => !value)}><Icon name="plus" size={12}/></button>
      </div>
      <div className="git-path" title={snapshot?.repositoryPath ?? repositoryPath}>{snapshot?.repositoryPath ?? repositoryPath}</div>
      {remote && runtime?.stale && <div className="git-feedback stale" role="status">连接已断开，当前内容可能已过期；重新连接后将自动刷新。</div>}
      {snapshot?.head.upstream && <div className="git-upstream">{snapshot.head.upstream} · ↑{snapshot.head.ahead} ↓{snapshot.head.behind}</div>}
      {creatingBranch && <form className="git-inline-form" onSubmit={(event) => { event.preventDefault(); if (!root || !newBranch.trim()) return; void mutate("branch", () => createBranch(root, newBranch.trim())).then(() => { setNewBranch(""); setCreatingBranch(false); }); }}>
        <input aria-label="新分支名称" value={newBranch} autoFocus maxLength={255} placeholder="新分支名称" onChange={(event) => setNewBranch(event.target.value)}/>
        <button type="submit" disabled={disabled || !newBranch.trim()}>创建并切换</button>
      </form>}
    </GitSection>

    <GitSection className="git-changes-section" title={`更改${snapshot ? ` ${snapshot.changes.length}` : ""}`} collapsed={collapsed.changes} onToggle={() => setCollapsed((value) => ({ ...value, changes: !value.changes }))} actions={<>
      <button type="button" aria-label="暂存全部更改" title="暂存全部" disabled={disabled || !root || unstaged.length + conflicts.length === 0} onClick={() => root && void mutate("stageAll", () => stageAll(root))}><Icon name="plus" size={12}/></button>
      <button type="button" aria-label="取消暂存全部更改" title="取消暂存全部" disabled={disabled || !root || staged.length === 0} onClick={() => root && void mutate("unstageAll", () => unstageAll(root))}><Icon name="clear" size={12}/></button>
    </>}>
      <div className="git-commit-box">
        <textarea aria-label="提交消息" rows={2} value={message} maxLength={10_000} placeholder="消息（Ctrl+Enter 提交）" onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter" && root && message.trim() && staged.length) { event.preventDefault(); void mutate("commit", () => commit(root, message.trim()), true); } }}/>
        <button type="button" disabled={disabled || !root || !message.trim() || staged.length === 0} onClick={() => root && void mutate("commit", () => commit(root, message.trim()), true)}><Icon name="check" size={13}/>提交</button>
      </div>
      {error && <div className="git-feedback" role="alert">{error.message}</div>}
      <div className="git-change-scroll" role="list" aria-label="Git 更改">
        {conflicts.length > 0 && <GitChangeGroup title="冲突" changes={conflicts} actionLabel="暂存已解决文件" onAction={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}/>} 
        {staged.length > 0 && <GitChangeGroup title="暂存的更改" changes={staged} actionLabel="取消暂存" onAction={(change) => root && void mutate("unstage", () => unstagePaths(root, [change.path]))}/>} 
        {unstaged.length > 0 && <GitChangeGroup title="更改" changes={unstaged} actionLabel="暂存" onAction={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}/>} 
        {snapshot && snapshot.changes.length === 0 && <div className="git-clean-state"><Icon name="checkCircle" size={16}/>工作区干净</div>}
        {!snapshot && !error && <div className="git-clean-state">正在读取仓库…</div>}
      </div>
    </GitSection>

    <GitSection className="git-graph-section" title="图表" collapsed={collapsed.graph} onToggle={() => setCollapsed((value) => ({ ...value, graph: !value.graph }))}>
      <div className="git-graph-scroll" role="list" aria-label="提交图表">
        {snapshot?.commits.map((commit, index) => <div className="git-commit-row" role="listitem" key={commit.oid}>
          <GitGraph row={graphRows[index]}/>
          <span className="git-commit-content"><span className="git-commit-subject">{commit.subject}</span><span className="git-commit-meta">{commit.author} · {formatCommitTime(commit.timestamp)} · {commit.oid.slice(0, 7)}</span></span>
          {commit.decorations.length > 0 && <span className="git-decorations">{commit.decorations.slice(0, 2).map((decoration) => <span key={decoration}>{decoration}</span>)}</span>}
        </div>)}
        {snapshot && snapshot.commits.length === 0 && <div className="git-clean-state">提交后将在这里显示分支图</div>}
      </div>
    </GitSection>
  </div>;
}

function GitGraph({ row }: { row: GitGraphRow }) {
  const laneGap = 11;
  const centerY = 17;
  const width = row.laneCount * laneGap + 6;
  const x = (lane: number) => lane * laneGap + 7;
  return <svg className="git-graph-lanes" aria-hidden="true" width={width} height="34" viewBox={`0 0 ${width} 34`}>
    {row.incoming && <path d={`M ${x(row.currentLane)} 0 L ${x(row.currentLane)} ${centerY}`}/>} 
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.from}:${segment.to}:${index}`} data-kind={segment.kind} d={segment.kind === "through"
      ? `M ${x(segment.from)} 0 L ${x(segment.to)} 34`
      : `M ${x(segment.from)} ${centerY} C ${x(segment.from)} 24, ${x(segment.to)} 27, ${x(segment.to)} 34`}/>) }
    <circle cx={x(row.currentLane)} cy={centerY} r="4"/>
  </svg>;
}

function GitSection({ title, collapsed, onToggle, actions, className = "", children }: { title: string; collapsed: boolean; onToggle: () => void; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`git-section ${className}${collapsed ? " collapsed" : ""}`}>
    <header className="git-section-header"><button type="button" className="git-section-toggle" aria-expanded={!collapsed} onClick={onToggle}><Icon name="chevronDown" size={10}/><span>{title}</span></button><div className="git-section-actions">{actions}</div></header>
    {!collapsed && <div className="git-section-content">{children}</div>}
  </section>;
}

function GitChangeGroup({ title, changes, actionLabel, onAction }: { title: string; changes: GitChange[]; actionLabel: string; onAction: (change: GitChange) => void }) {
  const visible = changes.slice(0, 500);
  return <div className="git-change-group"><div className="git-change-group-title">{title}<span>{changes.length}</span></div>{visible.map((change) => <div className="git-change-row" role="listitem" key={`${change.path}:${change.staged}:${change.status}`} title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path}>
    <Icon name="file" size={13}/><span className="git-change-path">{change.path}</span><span className={`git-change-status${change.conflict ? " conflict" : ""}`}>{change.status}</span><button type="button" aria-label={`${actionLabel} ${change.path}`} title={actionLabel} onClick={() => onAction(change)}><Icon name={change.staged ? "clear" : "plus"} size={11}/></button>
  </div>)}{changes.length > visible.length && <div className="git-list-limit">另有 {changes.length - visible.length} 项，请使用终端处理后刷新</div>}</div>;
}

function GitEmpty({ icon, title, detail, action, secondary, onAction, onSecondary }: { icon: "git"; title: string; detail: string; action?: string; secondary?: string; onAction?: () => void; onSecondary?: () => void }) {
  return <div className="git-empty"><Icon name={icon} size={28}/><strong>{title}</strong><span>{detail}</span><div>{action && <button type="button" onClick={onAction}>{action}</button>}{secondary && <button type="button" className="secondary" onClick={onSecondary}>{secondary}</button>}</div></div>;
}

function formatCommitTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
}

function gitFailureTitle(code: string): string {
  if (code === "gitMissing") return "远程主机未安装 Git";
  if (code === "gitUnsupportedRemote") return "远程环境不受支持";
  if (code === "gitPermissionDenied") return "无法访问远程仓库";
  if (code === "gitSessionUnavailable") return "远程 Git 连接已中断";
  return "无法读取 Git 仓库";
}
