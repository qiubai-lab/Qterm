import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon } from "../components/Icon";
import { gitSubmoduleUnavailableReason, type GitRepositoryTreeNode } from "./gitRepositoryContext";
import { branchOverlayKinds, type GitRepositoryOverlay } from "./gitPaneTypes";
import { useGitRepositoryRowLayout } from "./useGitRepositoryRowLayout";

function shortOid(oid: string | null): string {
  return oid?.slice(0, 8) ?? "--------";
}

function branchLabel(node: GitRepositoryTreeNode): string {
  if (node.snapshot?.head.detached) return "detached HEAD";
  return node.snapshot?.head.name ?? "未命名分支";
}

export function GitRepositoryTree({
  nodes, activePath, disabled, updatingPath, remoteReady, repositoryOverlay,
  onSelect, onToggle, onInitialize, onFetch, onShowChanges, onOpenOverlay,
  onRegisterBranchButton, onRegisterActionsButton,
}: {
  nodes: GitRepositoryTreeNode[];
  activePath: string | null;
  disabled: boolean;
  updatingPath: string | null;
  remoteReady: boolean;
  repositoryOverlay: GitRepositoryOverlay | null;
  onSelect: (node: GitRepositoryTreeNode) => void;
  onToggle: (node: GitRepositoryTreeNode) => void;
  onInitialize: (node: GitRepositoryTreeNode) => void;
  onFetch: (node: GitRepositoryTreeNode) => void;
  onShowChanges: (node: GitRepositoryTreeNode) => void;
  onOpenOverlay: (node: GitRepositoryTreeNode, kind: "branches" | "repositoryActions") => void;
  onRegisterBranchButton: (path: string, element: HTMLButtonElement | null) => void;
  onRegisterActionsButton: (path: string, element: HTMLButtonElement | null) => void;
}) {
  const [focusState, setFocusState] = useState(() => ({ activePath, path: activePath ?? nodes[0]?.path ?? "" }));
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const { treeRef, densities } = useGitRepositoryRowLayout(nodes);
  const visiblePaths = useMemo(() => nodes.map((node) => node.path), [nodes]);
  const selectedIndex = nodes.findIndex((node) => node.path === activePath);
  const focusedPath = focusState.activePath === activePath && visiblePaths.includes(focusState.path)
    ? focusState.path
    : activePath && visiblePaths.includes(activePath) ? activePath : visiblePaths[0] ?? "";

  function focusNode(path: string) {
    setFocusState({ activePath, path });
    itemRefs.current.get(path)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLButtonElement && !event.target.classList.contains("git-repository-tree-select")) return;
    const focusedEntry = [...itemRefs.current.entries()].find(([, element]) => element === document.activeElement);
    const currentPath = focusedEntry?.[0] ?? focusedPath;
    const index = nodes.findIndex((node) => node.path === currentPath);
    if (index < 0) return;
    const node = nodes[index];
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : event.key === "ArrowDown" ? Math.min(nodes.length - 1, index + 1) : Math.max(0, index - 1);
      focusNode(nodes[nextIndex].path);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (node.hasChildren && !node.expanded) onToggle(node);
      else if (nodes[index + 1]?.parentPath === node.path) focusNode(nodes[index + 1].path);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.hasChildren && node.expanded && node.parentPath) onToggle(node);
      else if (node.parentPath) focusNode(node.parentPath);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (node.selectable && !disabled) onSelect(node);
    }
  }

  return <div
    ref={treeRef}
    className="git-repository-tree"
    role="tree"
    aria-label="Git 存储库"
    onKeyDown={handleKeyDown}
    style={{ "--git-repository-selected-index": Math.max(selectedIndex, 0) } as CSSProperties}
  >
    {selectedIndex >= 0 && <span className="git-repository-selection-indicator" aria-hidden="true"/>}
    {nodes.map((node) => {
      const selected = node.path === activePath;
      const snapshot = node.snapshot;
      const submodule = node.submodule;
      const unavailableReason = submodule ? gitSubmoduleUnavailableReason(submodule) : undefined;
      const updating = updatingPath === node.path;
      const branch = branchLabel(node);
      const branchOpen = repositoryOverlay?.repositoryPath === node.path && branchOverlayKinds.has(repositoryOverlay.kind);
      const actionsOpen = repositoryOverlay?.repositoryPath === node.path && !branchOverlayKinds.has(repositoryOverlay.kind);
      return <div
        className="git-repository-treeitem"
        role="treeitem"
        aria-level={node.depth + 1}
        aria-selected={selected}
        aria-expanded={node.hasChildren ? node.expanded : undefined}
        aria-disabled={!node.selectable || undefined}
        data-selected={selected || undefined}
        data-attention={submodule && node.state !== "干净" || undefined}
        data-depth={node.depth}
        data-repository-path={node.path}
        data-density={densities[node.path] ?? 0}
        key={node.id}
        style={{ "--git-repository-depth": node.depth } as CSSProperties}
      >
        {node.depth > 0 && <div className="git-repository-tree-leading">
          {node.hasChildren
            ? <button type="button" className="git-repository-tree-toggle" aria-label={`${node.expanded ? "折叠" : "展开"} ${node.name}`} disabled={disabled} onClick={() => onToggle(node)}><Icon name="chevronDown" size={9}/></button>
            : <Icon name="submodule" size={12}/>}
        </div>}
        <button
          ref={(element) => { if (element) itemRefs.current.set(node.path, element); else itemRefs.current.delete(node.path); }}
          type="button"
          className="git-repository-tree-select"
          tabIndex={focusedPath === node.path ? 0 : -1}
          aria-label={`${selected ? "当前存储库" : "切换到"} ${node.name}，${node.state}`}
          aria-current={selected ? "true" : undefined}
          onFocus={() => setFocusState({ activePath, path: node.path })}
          onClick={() => node.selectable && !disabled && onSelect(node)}
        >
          <Icon name="git" size={13}/>
          <span className="git-repository-tree-copy"><strong className="git-repository-name" data-updating={updating || undefined} title={node.name}>{node.name}</strong><span title={node.depth === 0 ? undefined : node.relativePath}>{node.depth === 0 ? "父仓库" : node.relativePath}</span></span>
          {!snapshot && <span className="git-repository-tree-state" title={submodule ? `记录 ${shortOid(submodule.recordedOid)} · 当前 ${shortOid(submodule.currentOid)}` : node.path}>{node.state}</span>}
        </button>
        {snapshot && <div className="git-repository-node-controls" role="group" aria-label={`${node.name} 仓库操作`}>
          <button ref={(element) => onRegisterBranchButton(node.path, element)} type="button" className="git-branch-trigger" aria-label={selected ? `切换分支，当前 ${branch}` : `切换 ${node.name} 分支，当前 ${branch}`} title={snapshot.mergeInProgress ? "完成或中止当前合并后才能切换分支" : `切换分支 · ${branch}`} aria-haspopup="dialog" aria-expanded={branchOpen} disabled={disabled || snapshot.mergeInProgress} onClick={() => onOpenOverlay(node, "branches")}><Icon name="git" size={12}/><span>{branch}</span></button>
          <div className="git-repository-status-group" role="group" aria-label={`${node.name} 更改与同步状态`}>
            <button type="button" className="git-repository-change-count" aria-label={`查看 ${node.name} 的 ${snapshot.changes.length} 项更改`} onClick={() => onShowChanges(node)}><span>更改</span><strong>{snapshot.changes.length}</strong></button>
            {snapshot.head.upstream && <span className="git-repository-sync" aria-label={`领先 ${snapshot.head.ahead} 个提交，落后 ${snapshot.head.behind} 个提交`} title={`领先 ${snapshot.head.ahead} · 落后 ${snapshot.head.behind}`}><span>↑{snapshot.head.ahead}</span><span>↓{snapshot.head.behind}</span></span>}
          </div>
          <button type="button" className="git-repository-refresh" data-updating={updating || undefined} aria-busy={updating || undefined} aria-label={selected ? updating ? "正在更新 Git 状态" : "刷新 Git 状态" : `刷新 ${node.name} Git 状态`} title={snapshot.mergeInProgress ? "完成或中止当前合并后才能获取远程更新" : updating ? "正在更新仓库状态" : "获取远程更新并刷新"} disabled={disabled || updating || snapshot.mergeInProgress} onClick={() => onFetch(node)}><Icon name="sync" size={14}/></button>
          <button ref={(element) => onRegisterActionsButton(node.path, element)} type="button" aria-label={selected ? "Git 仓库操作" : `Git 仓库操作：${node.name}`} title="Pull、Push、同步、合并、分支管理与操作记录" aria-haspopup="menu" aria-expanded={actionsOpen} disabled={!remoteReady} onClick={() => onOpenOverlay(node, "repositoryActions")}><Icon name="more" size={13}/></button>
        </div>}
        {submodule && !snapshot && <div className="git-repository-tree-actions">
          {!submodule.initialized && <button type="button" aria-label={`初始化 ${node.relativePath}`} title={unavailableReason} disabled={disabled || Boolean(unavailableReason)} onClick={() => onInitialize(node)}>初始化</button>}
        </div>}
      </div>;
    })}
  </div>;
}
