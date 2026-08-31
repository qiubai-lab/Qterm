import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import {
  abortGitMerge, commitGitChanges, continueGitMerge, createGitBranch, createGitBranchFrom, deleteGitBranch, gitAvailable, gitError, initializeGitRepository,
  executeRemoteGit, fetchGitRepository, loadGitCommitFiles, loadGitSnapshot, loadRemoteGitCommitFiles, stageAllGitChanges, stageGitPaths,
  mergeGitBranch, pullGitRepository, pushGitRepository, renameGitBranch, switchGitBranch, trackGitRemoteBranch, unstageAllGitChanges, unstageGitPaths,
  type GitBranch, type GitChange, type GitCommit, type GitCommitFile, type GitSnapshot, type RemoteGitAction,
} from "../lib/tauri/git";
import { gitRepositoryHistoryEntryKey } from "../workspace/gitRepositoryHistory";
import type { GitRepositoryHistoryEntry, GitTarget } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { calculateGitCommitTooltipPosition } from "./gitCommitTooltipPosition";
import { buildGitGraphRows, type GitGraphRow } from "./gitGraph";

interface GitPaneProps {
  blockId: string;
  target: GitTarget;
  runtime?: GitRuntime;
  visible: boolean;
  onTargetChange: (target: GitTarget) => void;
  onRequestRepositoryChange?: () => void;
  onRepositoryOpened?: (repository: GitRepositoryHistoryEntry) => void;
}

type GitRepositoryOverlayKind =
  | "branches"
  | "createBranch"
  | "createBranchFrom"
  | "renameBranch"
  | "deleteBranch"
  | "repositoryActions"
  | "mergeBranch"
  | "abortMerge"
  | "publishBranch"
  | "operationLog";

interface GitRepositoryOverlay {
  kind: GitRepositoryOverlayKind;
  left: number;
  top: number;
  placement: "above" | "below";
}

interface GitRepositorySubmenu {
  left: number;
  top: number;
  side: "left" | "right";
}

interface GitCommitFilesState {
  status: "loading" | "ready" | "error";
  files: GitCommitFile[];
  message?: string;
}

interface GitOperationRecord {
  id: number;
  name: string;
  status: "running" | "success" | "attention" | "error";
  startedAt: number;
  durationMs?: number;
  detail: string;
}

const branchOverlayKinds = new Set<GitRepositoryOverlayKind>([
  "branches", "createBranch",
]);

const gitGraphLaneGap = 11;
const gitGraphLaneOffset = 7;

function gitGraphRailWidth(laneCount: number): number {
  return laneCount * gitGraphLaneGap + 6;
}

function gitGraphLaneX(lane: number): number {
  return lane * gitGraphLaneGap + gitGraphLaneOffset;
}

function gitTargetKey(target: GitTarget): string {
  return target.type === "unbound" ? "unbound" : gitRepositoryHistoryEntryKey(target);
}

function fitRepositoryOverlay(anchor: DOMRect, width: number, height: number): Omit<GitRepositoryOverlay, "kind"> {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

function fitRepositorySubmenu(anchor: DOMRect, width: number, height: number): GitRepositorySubmenu {
  const gutter = 8;
  const offset = 4;
  const right = anchor.right + offset;
  const opensRight = right + width <= window.innerWidth - gutter;
  const left = opensRight ? Math.max(gutter, right) : Math.max(gutter, anchor.left - width - offset);
  const top = Math.max(gutter, Math.min(anchor.top, window.innerHeight - height - gutter));
  return { left, top, side: opensRight ? "right" : "left" };
}

export function GitPane({ blockId, target, runtime, visible, onTargetChange, onRequestRepositoryChange, onRepositoryOpened }: GitPaneProps) {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null);
  const [localAvailable, setLocalAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [branchSourceRef, setBranchSourceRef] = useState("");
  const [selectedBranchRef, setSelectedBranchRef] = useState("");
  const [selectedRemote, setSelectedRemote] = useState("");
  const [mergeSourceRef, setMergeSourceRef] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [operations, setOperations] = useState<GitOperationRecord[]>([]);
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [hoveredCommitOid, setHoveredCommitOid] = useState<string | null>(null);
  const [focusedCommitOid, setFocusedCommitOid] = useState<string | null>(null);
  const [expandedCommitKey, setExpandedCommitKey] = useState<string | null>(null);
  const [commitFilesCache, setCommitFilesCache] = useState<Record<string, GitCommitFilesState>>({});
  const [repositoryOverlay, setRepositoryOverlay] = useState<GitRepositoryOverlay | null>(null);
  const [repositorySubmenu, setRepositorySubmenu] = useState<GitRepositorySubmenu | null>(null);
  const [collapsed, setCollapsed] = useState({ repository: false, changes: false, graph: true });
  const epoch = useRef(0);
  const busyRef = useRef("");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const onTargetChangeRef = useRef(onTargetChange);
  const onRepositoryOpenedRef = useRef(onRepositoryOpened);
  const reportedRepositoryKeyRef = useRef<string | null>(null);
  const targetKeyRef = useRef(gitTargetKey(target));
  const branchButtonRef = useRef<HTMLButtonElement>(null);
  const repositoryActionsButtonRef = useRef<HTMLButtonElement>(null);
  const repositoryOverlayRef = useRef<HTMLElement | null>(null);
  const repositorySubmenuRef = useRef<HTMLElement | null>(null);
  const branchManagementItemRef = useRef<HTMLButtonElement>(null);
  const mergeAbortButtonRef = useRef<HTMLButtonElement>(null);
  const previousMergeStateRef = useRef(false);
  const operationSequence = useRef(0);
  const commitAnchorRefs = useRef(new Map<string, HTMLButtonElement>());
  const commitTooltipRef = useRef<HTMLDivElement>(null);
  const commitTooltipId = useId();
  const repositorySubmenuId = useId();
  const repositoryPath = target.type === "unbound" ? null : target.path;
  const remote = target.type === "remote";
  const remoteProfileId = target.type === "remote" ? target.profileId : null;
  const remoteSessionId = runtime?.sessionId;
  const remoteStatus = runtime?.status;
  const remoteReady = !remote || runtime?.status === "connected";
  const available = remote ? true : localAvailable;

  const updateBusy = useCallback((value: string) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);
  useEffect(() => {
    onRepositoryOpenedRef.current = onRepositoryOpened;
  }, [onRepositoryOpened]);
  useEffect(() => {
    const nextTargetKey = gitTargetKey(target);
    if (targetKeyRef.current === nextTargetKey) return;
    targetKeyRef.current = nextTargetKey;
    epoch.current += 1;
    updateBusy("");
    setRepositoryOverlay(null);
    setRepositorySubmenu(null);
    setMergeSourceRef("");
    setOperations([]);
    if (reportedRepositoryKeyRef.current !== nextTargetKey) reportedRepositoryKeyRef.current = null;
  }, [target, updateBusy]);

  const applySnapshot = useCallback((next: GitSnapshot) => {
    setSnapshot(next);
    setError(null);
    const repository: GitRepositoryHistoryEntry = remote && remoteProfileId
      ? { type: "remote", profileId: remoteProfileId, path: next.repositoryPath }
      : { type: "local", path: next.repositoryPath };
    const repositoryKey = gitRepositoryHistoryEntryKey(repository);
    if (reportedRepositoryKeyRef.current !== repositoryKey) {
      reportedRepositoryKeyRef.current = repositoryKey;
      onRepositoryOpenedRef.current?.(repository);
    }
    if (next.repositoryPath !== repositoryPath && !remote) onTargetChangeRef.current({ type: "local", path: next.repositoryPath });
  }, [remote, remoteProfileId, repositoryPath]);

  const remoteExecute = useCallback((action: RemoteGitAction) => {
    if (!remote || !remoteProfileId || !remoteSessionId || remoteStatus !== "connected") return Promise.reject(new Error("远程 Git 连接尚未建立"));
    return executeRemoteGit(remoteSessionId, remoteProfileId, action);
  }, [remote, remoteProfileId, remoteSessionId, remoteStatus]);

  const loadSnapshot = useCallback((path: string) => remote ? remoteExecute({ type: "snapshot", path }) : loadGitSnapshot(path), [remote, remoteExecute]);
  const fetchSnapshot = useCallback((repository: string) => remote ? remoteExecute({ type: "fetch", repository }) : fetchGitRepository(repository), [remote, remoteExecute]);
  const initialize = useCallback((path: string) => remote ? remoteExecute({ type: "initialize", path }) : initializeGitRepository(path), [remote, remoteExecute]);
  const stagePaths = useCallback((repository: string, paths: string[]) => remote ? remoteExecute({ type: "stage", repository, paths }) : stageGitPaths(repository, paths), [remote, remoteExecute]);
  const stageAll = useCallback((repository: string) => remote ? remoteExecute({ type: "stageAll", repository }) : stageAllGitChanges(repository), [remote, remoteExecute]);
  const unstagePaths = useCallback((repository: string, paths: string[]) => remote ? remoteExecute({ type: "unstage", repository, paths }) : unstageGitPaths(repository, paths), [remote, remoteExecute]);
  const unstageAll = useCallback((repository: string) => remote ? remoteExecute({ type: "unstageAll", repository }) : unstageAllGitChanges(repository), [remote, remoteExecute]);
  const commit = useCallback((repository: string, message: string) => remote ? remoteExecute({ type: "commit", repository, message }) : commitGitChanges(repository, message), [remote, remoteExecute]);
  const createBranch = useCallback((repository: string, name: string) => remote ? remoteExecute({ type: "createBranch", repository, name }) : createGitBranch(repository, name), [remote, remoteExecute]);
  const createBranchAt = useCallback((repository: string, name: string, sourceRef: string) => remote ? remoteExecute({ type: "createBranchFrom", repository, name, sourceRef }) : createGitBranchFrom(repository, name, sourceRef), [remote, remoteExecute]);
  const renameBranch = useCallback((repository: string, refName: string, newName: string) => remote ? remoteExecute({ type: "renameBranch", repository, refName, newName }) : renameGitBranch(repository, refName, newName), [remote, remoteExecute]);
  const deleteBranch = useCallback((repository: string, refName: string) => remote ? remoteExecute({ type: "deleteBranch", repository, refName }) : deleteGitBranch(repository, refName), [remote, remoteExecute]);
  const switchBranch = useCallback((repository: string, name: string) => remote ? remoteExecute({ type: "switchBranch", repository, name }) : switchGitBranch(repository, name), [remote, remoteExecute]);
  const pullRepository = useCallback((repository: string) => remote ? remoteExecute({ type: "pull", repository }) : pullGitRepository(repository), [remote, remoteExecute]);
  const pushRepository = useCallback((repository: string, selectedRemote?: string | null) => remote ? remoteExecute({ type: "push", repository, remote: selectedRemote ?? null }) : pushGitRepository(repository, selectedRemote ?? null), [remote, remoteExecute]);
  const trackRemoteBranch = useCallback((repository: string, refName: string) => remote ? remoteExecute({ type: "trackRemoteBranch", repository, refName }) : trackGitRemoteBranch(repository, refName), [remote, remoteExecute]);
  const mergeBranch = useCallback((repository: string, sourceRef: string) => remote ? remoteExecute({ type: "mergeBranch", repository, sourceRef }) : mergeGitBranch(repository, sourceRef), [remote, remoteExecute]);
  const continueMerge = useCallback((repository: string) => remote ? remoteExecute({ type: "continueMerge", repository }) : continueGitMerge(repository), [remote, remoteExecute]);
  const abortMerge = useCallback((repository: string) => remote ? remoteExecute({ type: "abortMerge", repository }) : abortGitMerge(repository), [remote, remoteExecute]);

  const refreshSnapshot = useCallback(async () => {
    if (!repositoryPath || !visible || !remoteReady) return;
    if (busyRef.current && busyRef.current !== "refresh") return;
    const request = ++epoch.current;
    updateBusy("refresh");
    try {
      const next = await loadSnapshot(repositoryPath);
      if (request === epoch.current) applySnapshot(next);
    } catch (cause) {
      if (request === epoch.current) { setSnapshot(null); setError(gitError(cause)); }
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }, [applySnapshot, loadSnapshot, remoteReady, repositoryPath, updateBusy, visible]);

  const fetchAndRefresh = useCallback(async () => {
    if (!repositoryPath || !visible || !remoteReady || busyRef.current) return;
    const request = ++epoch.current;
    updateBusy("fetch");
    setError(null);
    try {
      const next = await fetchSnapshot(repositoryPath);
      if (request === epoch.current) applySnapshot(next);
    } catch (cause) {
      if (request === epoch.current) setError(gitError(cause));
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }, [applySnapshot, fetchSnapshot, remoteReady, repositoryPath, updateBusy, visible]);

  useEffect(() => {
    if (remote) return;
    void gitAvailable().then(setLocalAvailable, () => setLocalAvailable(false));
  }, [remote]);
  useEffect(() => {
    if (!visible || !available) return;
    const timer = window.setTimeout(() => void refreshSnapshot(), 0);
    return () => window.clearTimeout(timer);
  }, [available, refreshSnapshot, visible]);
  useEffect(() => {
    if (!visible) return;
    const onFocus = () => void refreshSnapshot();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSnapshot, visible]);
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

  async function mutate(label: string, operation: () => Promise<GitSnapshot>, clearMessage = false): Promise<boolean> {
    if (busyRef.current) return false;
    const request = ++epoch.current;
    updateBusy(label); setError(null);
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
      if (request === epoch.current) updateBusy("");
    }
  }

  function beginOperation(name: string): number {
    const id = ++operationSequence.current;
    const record: GitOperationRecord = { id, name, status: "running", startedAt: Date.now(), detail: "正在执行…" };
    setOperations((value) => [record, ...value].slice(0, 20));
    return id;
  }

  function finishOperation(id: number, status: "success" | "attention" | "error", detail: string) {
    const finishedAt = Date.now();
    setOperations((value) => value.map((record) => record.id === id
      ? { ...record, status, durationMs: Math.max(0, finishedAt - record.startedAt), detail: visibleOperationDetail(detail) }
      : record));
  }

  async function recoverSnapshotAfterFailure(request: number, failure: { code: string; message: string }) {
    if (!root) return;
    try {
      const recovered = await loadSnapshot(root);
      if (request !== epoch.current) return;
      applySnapshot(recovered);
      setError(failure);
    } catch {
      if (request === epoch.current) setError(failure);
    }
  }

  async function runRecordedOperation(
    name: string,
    operation: () => Promise<GitSnapshot>,
    successDetail = "操作完成",
  ): Promise<boolean> {
    if (busyRef.current) return false;
    const request = ++epoch.current;
    const recordId = beginOperation(name);
    updateBusy(name);
    setError(null);
    try {
      const next = await operation();
      if (request !== epoch.current) return false;
      applySnapshot(next);
      finishOperation(recordId, "success", successDetail);
      return true;
    } catch (cause) {
      const failure = gitError(cause);
      if (request === epoch.current) {
        setError(failure);
        finishOperation(recordId, "error", failure.message);
        await recoverSnapshotAfterFailure(request, failure);
      }
      return false;
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }

  async function runMergeOperation(sourceRef: string): Promise<boolean> {
    if (!root || busyRef.current) return false;
    const request = ++epoch.current;
    const recordId = beginOperation("合并分支");
    updateBusy("merge");
    setError(null);
    try {
      const next = await mergeBranch(root, sourceRef);
      if (request !== epoch.current) return false;
      applySnapshot(next);
      finishOperation(
        recordId,
        next.mergeInProgress ? "attention" : "success",
        next.mergeInProgress ? "合并存在冲突，等待解决" : "分支合并已完成",
      );
      return true;
    } catch (cause) {
      const failure = gitError(cause);
      if (request === epoch.current) {
        setError(failure);
        finishOperation(recordId, "error", failure.message);
        await recoverSnapshotAfterFailure(request, failure);
      }
      return false;
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }

  async function synchronizeRepository() {
    if (!root || busyRef.current) return;
    const request = ++epoch.current;
    const recordId = beginOperation("同步");
    let pullCompleted = false;
    updateBusy("sync");
    setError(null);
    try {
      const pulled = await pullRepository(root);
      if (request !== epoch.current) return;
      pullCompleted = true;
      applySnapshot(pulled);
      const pushed = await pushRepository(root, null);
      if (request !== epoch.current) return;
      applySnapshot(pushed);
      finishOperation(recordId, "success", "Pull 已完成 · Push 已完成");
    } catch (cause) {
      const failure = gitError(cause);
      if (request === epoch.current) {
        setError(failure);
        finishOperation(
          recordId,
          "error",
          pullCompleted
            ? `Pull 已完成 · Push 失败：${failure.message}`
            : `Pull 失败：${failure.message} · Push 未执行`,
        );
        await recoverSnapshotAfterFailure(request, failure);
      }
    } finally {
      if (request === epoch.current) updateBusy("");
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
    const headRefName = snapshot.head.name ? `refs/heads/${snapshot.head.name}` : null;
    if (!snapshot.head.unborn || !snapshot.head.name || snapshot.branches.some((branch) => branch.refName === headRefName)) return snapshot.branches;
    return [{ refName: headRefName!, name: snapshot.head.name, kind: "local" as const, oid: snapshot.head.oid ?? "", current: true, upstream: snapshot.head.upstream, upstreamRef: null }, ...snapshot.branches];
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
  const visibleLocalBranches = useMemo(() => visibleBranches.filter((branch) => branch.kind === "local"), [visibleBranches]);
  const visibleRemoteBranches = useMemo(() => visibleBranches.filter((branch) => branch.kind === "remote"), [visibleBranches]);
  const localBranchOptions = useMemo(() => branchOptions.filter((branch) => branch.kind === "local"), [branchOptions]);
  const deletableBranchOptions = useMemo(() => localBranchOptions.filter((branch) => !branch.current), [localBranchOptions]);
  const mergeSourceOptions = useMemo(() => branchOptions.filter((branch) => !branch.current), [branchOptions]);
  const selectedMergeSource = mergeSourceOptions.find((branch) => branch.refName === mergeSourceRef) ?? null;
  const mergeInProgress = Boolean(snapshot?.mergeInProgress);
  const mergeWorktreeClean = snapshot?.changes.length === 0;

  useEffect(() => {
    if (mergeInProgress && !previousMergeStateRef.current) {
      setCollapsed((value) => ({ ...value, changes: false, graph: true }));
    }
    previousMergeStateRef.current = mergeInProgress;
  }, [mergeInProgress]);

  function commitFilesKey(oid: string): string | null {
    if (!root) return null;
    return JSON.stringify([remote ? "remote" : "local", remoteProfileId ?? "", root, oid]);
  }

  const inspectedCommitOid = focusedCommitOid ?? hoveredCommitOid;
  const inspectedCommit = visible && inspectedCommitOid
    ? snapshot?.commits.find((commit) => commit.oid === inspectedCommitOid) ?? null
    : null;
  const inspectedCommitCacheKey = inspectedCommit ? commitFilesKey(inspectedCommit.oid) : null;
  const inspectedCommitFileState = inspectedCommitCacheKey ? commitFilesCache[inspectedCommitCacheKey] : undefined;
  const inspectedCommitFileCount = inspectedCommitFileState?.status === "ready" ? inspectedCommitFileState.files.length : undefined;

  useLayoutEffect(() => {
    if (!inspectedCommit) return;
    const updatePosition = () => {
      const anchor = commitAnchorRefs.current.get(inspectedCommit.oid);
      const tooltip = commitTooltipRef.current;
      if (!anchor || !tooltip) return;
      const next = calculateGitCommitTooltipPosition(
        anchor.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      );
      tooltip.style.top = `${next.top}px`;
      tooltip.style.left = `${next.left}px`;
      tooltip.style.visibility = "visible";
      tooltip.dataset.placement = next.placement;
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [inspectedCommit, inspectedCommitFileCount]);

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

  const repositoryAnchor = useCallback((kind = repositoryOverlay?.kind): HTMLButtonElement | null => {
    if (kind === "abortMerge") return mergeAbortButtonRef.current;
    return kind && branchOverlayKinds.has(kind) ? branchButtonRef.current : repositoryActionsButtonRef.current;
  }, [repositoryOverlay?.kind]);

  function closeRepositoryOverlay(restoreFocus = false) {
    const anchor = repositoryOverlay ? repositoryAnchor(repositoryOverlay.kind) : null;
    setRepositoryOverlay(null);
    setRepositorySubmenu(null);
    if (restoreFocus) window.requestAnimationFrame(() => anchor?.focus());
  }

  function openRepositoryOverlay(kind: GitRepositoryOverlayKind) {
    if (repositoryOverlay?.kind === kind) {
      closeRepositoryOverlay(true);
      return;
    }
    const anchor = repositoryAnchor(kind);
    if (!anchor) return;
    setRepositorySubmenu(null);
    if (["createBranch", "createBranchFrom", "renameBranch", "deleteBranch", "publishBranch", "mergeBranch", "abortMerge"].includes(kind)) {
      setNewBranch("");
      setError(null);
    }
    if (kind === "branches") setBranchQuery("");
    if (kind === "createBranchFrom") setBranchSourceRef(branchOptions.find((branch) => branch.current)?.refName ?? branchOptions[0]?.refName ?? "");
    if (kind === "renameBranch") setSelectedBranchRef(localBranchOptions[0]?.refName ?? "");
    if (kind === "deleteBranch") setSelectedBranchRef(deletableBranchOptions[0]?.refName ?? "");
    if (kind === "publishBranch") setSelectedRemote(snapshot?.remotes[0] ?? "");
    if (kind === "mergeBranch") setMergeSourceRef(mergeSourceOptions[0]?.refName ?? "");
    const estimatedWidth = kind === "branches" ? 336 : kind === "repositoryActions" ? 210 : 292;
    const estimatedHeight = kind === "branches"
      ? Math.min(376, 118 + branchOptions.length * 44)
      : kind === "operationLog" ? 300 : kind === "repositoryActions" ? 222 : 190;
    setRepositoryOverlay({ kind, ...fitRepositoryOverlay(anchor.getBoundingClientRect(), estimatedWidth, estimatedHeight) });
  }

  function openBranchManagementSubmenu(moveFocus: boolean) {
    if (repositoryOverlay?.kind !== "repositoryActions" || !branchManagementItemRef.current) return;
    setRepositorySubmenu(fitRepositorySubmenu(branchManagementItemRef.current.getBoundingClientRect(), 210, 126));
    if (moveFocus) {
      window.requestAnimationFrame(() => repositorySubmenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    }
  }

  function closeBranchManagementSubmenu(restoreFocus: boolean) {
    setRepositorySubmenu(null);
    if (restoreFocus) window.requestAnimationFrame(() => branchManagementItemRef.current?.focus());
  }

  useLayoutEffect(() => {
    if (!repositoryOverlay || !repositoryOverlayRef.current) return;
    const anchor = repositoryAnchor(repositoryOverlay.kind);
    if (!anchor) return;
    const overlay = repositoryOverlayRef.current;
    const next = fitRepositoryOverlay(anchor.getBoundingClientRect(), overlay.offsetWidth, overlay.offsetHeight);
    setRepositoryOverlay((current) => {
      if (current?.kind !== repositoryOverlay.kind) return current;
      if (current.left === next.left && current.top === next.top && current.placement === next.placement) return current;
      return { ...current, ...next };
    });
  }, [repositoryAnchor, repositoryOverlay, visibleBranches.length]);

  useEffect(() => {
    if (!repositoryOverlay) return;
    const anchor = repositoryAnchor(repositoryOverlay.kind);
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!repositoryOverlayRef.current?.contains(node) && !repositorySubmenuRef.current?.contains(node) && !anchor?.contains(node)) {
        setRepositoryOverlay(null);
        setRepositorySubmenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (repositorySubmenu) {
        setRepositorySubmenu(null);
        window.requestAnimationFrame(() => branchManagementItemRef.current?.focus());
        return;
      }
      setRepositoryOverlay(null);
      window.requestAnimationFrame(() => anchor?.focus());
    };
    const closeOnViewportChange = (event: Event) => {
      const node = event.target;
      if (node instanceof Node && (repositoryOverlayRef.current?.contains(node) || repositorySubmenuRef.current?.contains(node))) return;
      setRepositoryOverlay(null);
      setRepositorySubmenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [repositoryAnchor, repositoryOverlay, repositorySubmenu]);

  useEffect(() => {
    if (!repositoryOverlay) return;
    if (repositoryOverlay.kind === "branches") {
      window.requestAnimationFrame(() => repositoryOverlayRef.current?.querySelector<HTMLInputElement>('.git-branch-search')?.focus());
    } else if (repositoryOverlay.kind === "repositoryActions") {
      window.requestAnimationFrame(() => repositoryOverlayRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    }
  }, [repositoryOverlay]);

  function navigateRepositoryMenu(event: React.KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), [role="option"]:not([disabled])'));
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items[items.length - 1].focus();
    else if (event.key === "ArrowDown") items[(current + 1 + items.length) % items.length].focus();
    else items[(current - 1 + items.length) % items.length].focus();
  }

  function renderBranchOption(branch: GitBranch) {
    const current = branch.kind === "local"
      && (branch.current || (!snapshot?.head.detached && branch.name === snapshot?.head.name));
    const commit = snapshot?.commits.find((item) => item.oid === branch.oid);
    const branchName = `${branch.name}${snapshot?.head.unborn && branch.kind === "local" && branch.name === snapshot.head.name ? "（未提交）" : ""}`;
    const kindLabel = current ? "当前" : branch.kind === "remote" ? "远程" : "本地";
    return <button
      type="button"
      role="option"
      aria-selected={current}
      data-kind={branch.kind}
      key={branch.refName}
      title={branch.name}
      onClick={() => {
        closeRepositoryOverlay(false);
        if (!root || current) return;
        if (branch.kind === "remote") {
          void mutate("trackRemoteBranch", () => trackRemoteBranch(root, branch.refName));
        } else {
          void mutate("switch", () => switchBranch(root, branch.name));
        }
      }}
    >
      <span className="git-branch-option-primary"><Icon name={branch.kind === "remote" ? "network" : "git"} size={12}/><strong>{branchName}</strong>{commit && <span className="git-branch-time">{formatRelativeCommitTime(commit.timestamp)}</span>}<span className="git-branch-kind">{kindLabel}</span></span>
      <span className="git-branch-option-meta">{commit?.author && <span className="git-branch-author" title={commit.author}>{commit.author}</span>}<span className="git-branch-oid" title={branch.oid}>{branch.oid.slice(0, 7)}</span>{commit?.subject && <span className="git-branch-subject" title={commit.subject}>{commit.subject}</span>}</span>
    </button>;
  }

  function renderRepositoryOverlay(): React.ReactNode {
    if (!repositoryOverlay) return null;
    const common = {
      "data-placement": repositoryOverlay.placement,
      style: { left: repositoryOverlay.left, top: repositoryOverlay.top },
    };
    const overlayRef = (node: HTMLElement | null) => { repositoryOverlayRef.current = node; };
    if (repositoryOverlay.kind === "branches") {
      return <div ref={overlayRef} className="git-repository-popover git-branch-popover" role="dialog" aria-label="切换分支" onKeyDown={navigateRepositoryMenu} {...common}>
        <div className="git-branch-search-shell"><Icon name="search" size={12}/><input className="git-branch-search" type="search" role="searchbox" aria-label="筛选分支" value={branchQuery} placeholder="筛选要签出的分支" onChange={(event) => setBranchQuery(event.target.value)}/></div>
        <div className="git-branch-actions">
          <button type="button" onClick={() => openRepositoryOverlay("createBranch")}><Icon name="plus" size={12}/><span>创建新分支…</span></button>
        </div>
        <div className="git-branch-list" role="listbox" aria-label="选择分支">
          <div className="git-branch-list-group" role="group" aria-label="本地分支">
            <div className="git-branch-list-header" role="presentation"><span>本地分支</span><span>{visibleLocalBranches.length}</span></div>
            {visibleLocalBranches.map(renderBranchOption)}
          </div>
          <div className="git-branch-list-group" role="group" aria-label="远程分支">
            <div className="git-branch-list-header" role="presentation"><span>远程分支</span><span>{visibleRemoteBranches.length}</span></div>
            {visibleRemoteBranches.map(renderBranchOption)}
          </div>
          {visibleBranches.length === 0 && <div className="git-branch-empty">没有匹配“{branchQuery.trim()}”的分支</div>}
        </div>
      </div>;
    }
    if (repositoryOverlay.kind === "createBranch") {
      return <form ref={overlayRef} className="git-repository-popover git-branch-create-popover" role="dialog" aria-label="新建分支" onSubmit={async (event) => {
        event.preventDefault();
        const name = newBranch.trim();
        if (!root || !name) return;
        const succeeded = await runRecordedOperation(
          "创建分支",
          () => createBranch(root, name),
          "已从当前 HEAD 创建并切换",
        );
        if (succeeded) { setNewBranch(""); closeRepositoryOverlay(true); }
      }} {...common}>
        <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>新建分支</strong></div>
        <label htmlFor={`git-new-branch-${blockId}`}><RequiredFieldLabel>分支名称</RequiredFieldLabel></label>
        <input id={`git-new-branch-${blockId}`} aria-label="新分支名称" value={newBranch} autoFocus maxLength={255} placeholder="例如 feature/login" onChange={(event) => setNewBranch(event.target.value)}/>
        <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
        <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => closeRepositoryOverlay(true)}>取消</button><button type="submit" disabled={disabled || !newBranch.trim()}>创建并切换</button></div>
      </form>;
    }
    if (repositoryOverlay.kind === "repositoryActions") {
      const tracked = Boolean(snapshot?.head.upstream);
      return <><div ref={overlayRef} className="git-repository-popover git-repository-action-popover" role="menu" aria-label="存储库操作" onKeyDown={navigateRepositoryMenu} {...common}>
        <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>存储库操作</strong></div>
        <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !tracked} onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => {
          closeRepositoryOverlay(false);
          if (root) void runRecordedOperation("拉取", () => pullRepository(root), "FF-only Pull 已完成");
        }}><Icon name="download" size={12}/><span>拉取</span></button>
        {tracked
          ? <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress} onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => {
            closeRepositoryOverlay(false);
            if (root) void runRecordedOperation("推送", () => pushRepository(root, null), "Push 已完成");
          }}><Icon name="upload" size={12}/><span>推送</span></button>
          : <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !snapshot?.remotes.length} onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => openRepositoryOverlay("publishBranch")}><Icon name="upload" size={12}/><span>发布分支…</span></button>}
        <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || !tracked} onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => {
          closeRepositoryOverlay(false);
          void synchronizeRepository();
        }}><Icon name="refresh" size={12}/><span>同步</span></button>
        <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || mergeInProgress || mergeSourceOptions.length === 0} onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => openRepositoryOverlay("mergeBranch")}><Icon name="git" size={12}/><span>合并分支…</span></button>
        <div className="git-repository-action-separator" role="separator"/>
        <button ref={branchManagementItemRef} type="button" className="git-repository-action-item" role="menuitem" disabled={mergeInProgress} aria-haspopup="menu" aria-expanded={Boolean(repositorySubmenu)} aria-controls={repositorySubmenuId} onPointerEnter={() => openBranchManagementSubmenu(false)} onKeyDown={(event) => {
          if (event.key !== "ArrowRight") return;
          event.preventDefault();
          event.stopPropagation();
          openBranchManagementSubmenu(true);
        }} onClick={() => openBranchManagementSubmenu(true)}><Icon name="settings" size={12}/><span>本地分支管理…</span><small className="git-repository-submenu-indicator" aria-hidden="true">›</small></button>
        <button type="button" className="git-repository-action-item" role="menuitem" aria-label="操作记录" onPointerEnter={() => setRepositorySubmenu(null)} onClick={() => openRepositoryOverlay("operationLog")}><Icon name="menu" size={12}/><span>操作记录</span><small>{operations.length}</small></button>
      </div>
      {repositorySubmenu && <div ref={(node) => { repositorySubmenuRef.current = node; }} id={repositorySubmenuId} className="git-repository-popover git-repository-action-popover git-repository-submenu" data-side={repositorySubmenu.side} style={{ left: repositorySubmenu.left, top: repositorySubmenu.top }} role="menu" aria-label="本地分支管理" onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          closeBranchManagementSubmenu(true);
          return;
        }
        navigateRepositoryMenu(event);
      }}>
        <div className="git-repository-popover-title"><Icon name="settings" size={13}/><strong>本地分支管理</strong></div>
        <button type="button" className="git-repository-action-item" role="menuitem" onClick={() => openRepositoryOverlay("createBranchFrom")}><Icon name="plus" size={12}/><span>从指定分支创建…</span></button>
        <button type="button" className="git-repository-action-item" role="menuitem" disabled={localBranchOptions.length === 0} onClick={() => openRepositoryOverlay("renameBranch")}><Icon name="edit" size={12}/><span>重命名本地分支…</span></button>
        <button type="button" className="git-repository-action-item danger" role="menuitem" disabled={deletableBranchOptions.length === 0} onClick={() => openRepositoryOverlay("deleteBranch")}><Icon name="trash" size={12}/><span>安全删除本地分支…</span></button>
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
      return <form ref={overlayRef} className="git-repository-popover git-branch-management-popover git-merge-popover" role="dialog" aria-label="合并分支" onSubmit={async (event) => {
        event.preventDefault();
        if (!root || !mergeSourceRef || !mergeWorktreeClean || mergeInProgress) return;
        const succeeded = await runMergeOperation(mergeSourceRef);
        if (succeeded) closeRepositoryOverlay(true);
      }} {...common}>
        <div className="git-repository-popover-title"><Icon name="git" size={13}/><strong>合并分支</strong></div>
        <label htmlFor={`git-merge-source-${blockId}`}><RequiredFieldLabel>源分支</RequiredFieldLabel></label>
        <select id={`git-merge-source-${blockId}`} aria-label="源分支" value={mergeSourceRef} onChange={(event) => setMergeSourceRef(event.target.value)}>
          {localSources.length > 0 && <optgroup label="本地分支">{localSources.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</optgroup>}
          {remoteSources.length > 0 && <optgroup label="远程分支">{remoteSources.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</optgroup>}
        </select>
        <div className="git-merge-direction" aria-label={`${selectedMergeSource?.name ?? "未选择"} → ${branchLabel}`}><span>{selectedMergeSource?.name ?? "未选择"}</span><strong aria-hidden="true">→</strong><span>{branchLabel}</span></div>
        <p className={mergeWorktreeClean ? "" : "git-merge-precondition"}>{mergeWorktreeClean ? "使用 Git 默认策略合并；不会自动 Fetch 或 Stash。" : "开始合并前请先提交或清理工作区更改。"}</p>
        <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
        <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => closeRepositoryOverlay(true)}>取消</button><button type="submit" disabled={disabled || mergeInProgress || !mergeWorktreeClean || !mergeSourceRef}>合并到 {branchLabel}</button></div>
      </form>;
    }
    if (repositoryOverlay.kind === "abortMerge") {
      return <form ref={overlayRef} className="git-repository-popover git-branch-management-popover git-merge-abort-popover" role="dialog" aria-label="中止合并" onSubmit={async (event) => {
        event.preventDefault();
        if (!root || !mergeInProgress) return;
        const succeeded = await runRecordedOperation("中止合并", () => abortMerge(root), "未完成的合并已中止");
        if (succeeded) closeRepositoryOverlay(true);
      }} {...common}>
        <div className="git-repository-popover-title"><Icon name="trash" size={13}/><strong>中止合并</strong></div>
        <p className="git-branch-management-danger">中止会恢复合并前状态，并可能放弃已经完成的冲突解决编辑。此操作不会执行额外 reset。</p>
        <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
        <div className="git-branch-create-actions"><button type="button" className="secondary" autoFocus onClick={() => closeRepositoryOverlay(true)}>取消</button><button type="submit" className="danger" disabled={disabled || !mergeInProgress}>确认中止</button></div>
      </form>;
    }

    const formTitle = repositoryOverlay.kind === "createBranchFrom"
      ? "从指定分支创建"
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
        succeeded = await runRecordedOperation("从分支创建", () => createBranchAt(root, name, branchSourceRef), `已从 ${branchSourceRef} 创建`);
      } else if (repositoryOverlay.kind === "renameBranch") {
        const name = newBranch.trim();
        if (!name || !selectedBranchRef) return;
        succeeded = await runRecordedOperation("重命名分支", () => renameBranch(root, selectedBranchRef, name), "本地分支已重命名");
      } else if (repositoryOverlay.kind === "deleteBranch") {
        if (!selectedBranchRef) return;
        succeeded = await runRecordedOperation("安全删除分支", () => deleteBranch(root, selectedBranchRef), "已使用非强制删除");
      } else {
        if (!selectedRemote) return;
        succeeded = await runRecordedOperation("发布分支", () => pushRepository(root, selectedRemote), `已发布到 ${selectedRemote} 并设置 upstream`);
      }
      if (succeeded) closeRepositoryOverlay(true);
    }} {...common}>
      <div className="git-repository-popover-title"><Icon name={isDelete ? "trash" : repositoryOverlay.kind === "publishBranch" ? "upload" : "git"} size={13}/><strong>{formTitle}</strong></div>
      {repositoryOverlay.kind === "createBranchFrom" && <>
        <label htmlFor={`git-branch-source-${blockId}`}><RequiredFieldLabel>起点分支</RequiredFieldLabel></label>
        <select id={`git-branch-source-${blockId}`} aria-label="起点分支" value={branchSourceRef} onChange={(event) => setBranchSourceRef(event.target.value)}>{branchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name} · {branch.kind === "local" ? "本地" : "远程"}</option>)}</select>
        <label htmlFor={`git-branch-from-name-${blockId}`}><RequiredFieldLabel>新分支名称</RequiredFieldLabel></label>
        <input id={`git-branch-from-name-${blockId}`} aria-label="新分支名称" value={newBranch} maxLength={255} autoFocus placeholder="例如 feature/login" onChange={(event) => setNewBranch(event.target.value)}/>
      </>}
      {repositoryOverlay.kind === "renameBranch" && <>
        <label htmlFor={`git-rename-ref-${blockId}`}><RequiredFieldLabel>本地分支</RequiredFieldLabel></label>
        <select id={`git-rename-ref-${blockId}`} aria-label="本地分支" value={selectedBranchRef} onChange={(event) => setSelectedBranchRef(event.target.value)}>{localBranchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}{branch.current ? " · 当前" : ""}</option>)}</select>
        <label htmlFor={`git-rename-name-${blockId}`}><RequiredFieldLabel>新分支名称</RequiredFieldLabel></label>
        <input id={`git-rename-name-${blockId}`} aria-label="新分支名称" value={newBranch} maxLength={255} autoFocus placeholder="例如 feature/new-name" onChange={(event) => setNewBranch(event.target.value)}/>
      </>}
      {repositoryOverlay.kind === "deleteBranch" && <>
        <label htmlFor={`git-delete-ref-${blockId}`}><RequiredFieldLabel>待删除分支</RequiredFieldLabel></label>
        <select id={`git-delete-ref-${blockId}`} aria-label="待删除分支" value={selectedBranchRef} onChange={(event) => setSelectedBranchRef(event.target.value)}>{deletableBranchOptions.map((branch) => <option value={branch.refName} key={branch.refName}>{branch.name}</option>)}</select>
        <p className="git-branch-management-danger">仅执行安全删除；未合并分支会被 Git 拒绝，不提供强制删除。</p>
      </>}
      {repositoryOverlay.kind === "publishBranch" && <>
        <label htmlFor={`git-publish-remote-${blockId}`}><RequiredFieldLabel>目标 remote</RequiredFieldLabel></label>
        <select id={`git-publish-remote-${blockId}`} aria-label="目标 remote" value={selectedRemote} onChange={(event) => setSelectedRemote(event.target.value)}>{snapshot?.remotes.map((remoteName) => <option value={remoteName} key={remoteName}>{remoteName}</option>)}</select>
        <p>将当前分支发布到同名远程分支并设置 upstream。</p>
      </>}
      <div className="git-branch-create-feedback" role={error ? "alert" : "status"} aria-hidden={!error}>{error?.message ?? "\u00a0"}</div>
      <div className="git-branch-create-actions"><button type="button" className="secondary" onClick={() => closeRepositoryOverlay(true)}>取消</button><button type="submit" className={isDelete ? "danger" : undefined} disabled={disabled || (repositoryOverlay.kind === "createBranchFrom" ? !newBranch.trim() || !branchSourceRef : repositoryOverlay.kind === "renameBranch" ? !newBranch.trim() || !selectedBranchRef : repositoryOverlay.kind === "deleteBranch" ? !selectedBranchRef : !selectedRemote)}>{repositoryOverlay.kind === "createBranchFrom" ? "创建并切换" : repositoryOverlay.kind === "renameBranch" ? "重命名" : repositoryOverlay.kind === "deleteBranch" ? "确认安全删除" : "发布并设置 upstream"}</button></div>
    </form>;
  }

  if (available === false) return <GitEmpty icon="git" title="未找到系统 Git" detail="安装 Git 并重新打开 Qterm 后即可使用 Git 管理。"/>;
  if (!repositoryPath) return <GitEmpty icon="git" title="选择本机仓库" detail="Git Block 一次管理一个本机或 SSH 工作区仓库。" action="选择文件夹" onAction={onRequestRepositoryChange}/>;
  if (remote && !remoteReady && !snapshot) return <GitEmpty icon="git" title={runtime?.status === "connecting" || runtime?.status === "authenticating" ? "正在连接远程 Git…" : "远程 Git 尚未连接"} detail={runtime?.notice || repositoryPath} secondary="更换远程路径" onSecondary={onRequestRepositoryChange}/>;
  if (error?.code === "notGitRepository") return <GitEmpty icon="git" title="尚未初始化存储库" detail={repositoryPath} action="初始化存储库" secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void mutate("initialize", () => initialize(repositoryPath))} onSecondary={onRequestRepositoryChange}/>;
  if (error && !snapshot) return <GitEmpty icon="git" title={gitFailureTitle(error.code)} detail={error.message} action={error.code === "gitMissing" || error.code === "gitUnsupportedRemote" ? undefined : "重试"} secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void refreshSnapshot()} onSecondary={onRequestRepositoryChange}/>;

  return <><div className="git-pane" data-block-id={blockId} data-busy={disabled || undefined} aria-busy={disabled}>
    <GitSection className="git-repository-section" title="存储库" meta={root ?? repositoryPath} collapsed={collapsed.repository} onToggle={() => setCollapsed((value) => ({ ...value, repository: !value.repository }))}>
      <div className="git-repository-card">
        <div className="git-repository-row">
          <Icon name="git" size={15}/>
          <span className="git-repository-name">{snapshot?.repositoryName ?? repositoryPath}</span>
          {snapshot && <button ref={branchButtonRef} type="button" className="git-branch-trigger" aria-label={`切换分支，当前 ${branchLabel}`} title={mergeInProgress ? "完成或中止当前合并后才能切换分支" : `切换分支 · ${branchLabel}`} aria-haspopup="dialog" aria-expanded={Boolean(repositoryOverlay && branchOverlayKinds.has(repositoryOverlay.kind))} disabled={disabled || mergeInProgress} onClick={() => openRepositoryOverlay("branches")}>
            <Icon name="git" size={12}/><span>{branchLabel}</span>
          </button>}
          <div className="git-repository-actions">
            {snapshot?.head.upstream && <span className="git-repository-sync" aria-label={`领先 ${snapshot.head.ahead} 个提交，落后 ${snapshot.head.behind} 个提交`} title={`领先 ${snapshot.head.ahead} · 落后 ${snapshot.head.behind}`}><span>↑{snapshot.head.ahead}</span><span>↓{snapshot.head.behind}</span></span>}
            <button type="button" className="git-repository-refresh" data-updating={busy === "fetch" || busy === "refresh" || undefined} aria-label={busy === "fetch" || busy === "refresh" ? "正在更新 Git 状态" : "刷新 Git 状态"} title={mergeInProgress ? "完成或中止当前合并后才能获取远程更新" : busy === "fetch" || busy === "refresh" ? "正在获取远程更新" : "获取远程更新并刷新"} disabled={disabled || mergeInProgress} onClick={() => void fetchAndRefresh()}><Icon name="refresh" size={13}/></button>
            {snapshot && <button ref={repositoryActionsButtonRef} type="button" aria-label="Git 仓库操作" title="Pull、Push、同步、合并、分支管理与操作记录" aria-haspopup="menu" aria-expanded={Boolean(repositoryOverlay && !branchOverlayKinds.has(repositoryOverlay.kind))} disabled={!remoteReady} onClick={() => openRepositoryOverlay("repositoryActions")}><Icon name="more" size={13}/></button>}
          </div>
        </div>
        {remote && runtime?.stale && <div className="git-feedback stale" role="status">连接已断开，当前内容可能已过期；重新连接后将自动刷新。</div>}
        {error && snapshot && <div className="git-feedback stale" role="status">上次 Git 操作失败，已保留并重新读取可用状态。</div>}
      </div>
    </GitSection>

    <GitSection className="git-changes-section" title={`更改${snapshot ? ` ${snapshot.changes.length}` : ""}`} collapsed={collapsed.changes} onToggle={() => toggleExclusiveSection("changes")} actions={<>
      <button type="button" aria-label="暂存全部更改" title="暂存全部" disabled={disabled || !root || unstaged.length + conflicts.length === 0} onClick={() => root && void mutate("stageAll", () => stageAll(root))}><Icon name="plus" size={12}/></button>
      <button type="button" aria-label="取消暂存全部更改" title="取消暂存全部" disabled={disabled || !root || staged.length === 0} onClick={() => root && void mutate("unstageAll", () => unstageAll(root))}><Icon name="clear" size={12}/></button>
    </>}>
      {mergeInProgress && <div className="git-merge-state" role="status">
        <Icon name="git" size={15}/>
        <div className="git-merge-state-copy"><strong>合并未完成</strong><span>{conflicts.length > 0 ? `${conflicts.length} 个冲突等待解决` : "冲突已解决，可以继续合并"}</span></div>
        <div className="git-merge-state-actions"><button type="button" className="secondary" disabled={disabled || conflicts.length > 0} onClick={() => root && void runRecordedOperation("继续合并", () => continueMerge(root), "合并提交已完成")}>继续合并</button><button ref={mergeAbortButtonRef} type="button" className="danger" disabled={disabled} onClick={() => openRepositoryOverlay("abortMerge")}>中止合并</button></div>
      </div>}
      <div className="git-commit-box">
        <textarea ref={messageRef} aria-label="提交消息" rows={1} data-max-rows="5" value={message} maxLength={10_000} placeholder="提交消息" onChange={(event) => setMessage(event.target.value)}/>
        <button type="button" className="git-commit-button" disabled={disabled || mergeInProgress || !root || !message.trim() || staged.length === 0} onClick={() => root && void mutate("commit", () => commit(root, message.trim()), true)}>提交</button>
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
          const fileState = cacheKey ? commitFilesCache[cacheKey] : undefined;
          const retainDetails = expanded || Boolean(fileState);
          const graphRow = graphRows[index];
          return <div className="git-commit-entry" role="listitem" key={commit.oid}>
            <button
              ref={(node) => {
                if (node) commitAnchorRefs.current.set(commit.oid, node);
                else commitAnchorRefs.current.delete(commit.oid);
              }}
              type="button"
              className="git-commit-row"
              aria-pressed={commit.oid === activeCommitOid}
              aria-expanded={expanded}
              aria-describedby={inspectedCommit?.oid === commit.oid ? commitTooltipId : undefined}
              onPointerEnter={() => setHoveredCommitOid(commit.oid)}
              onPointerLeave={() => setHoveredCommitOid((value) => value === commit.oid ? null : value)}
              onFocus={() => setFocusedCommitOid(commit.oid)}
              onBlur={() => setFocusedCommitOid((value) => value === commit.oid ? null : value)}
              onClick={() => toggleCommitFiles(commit)}
            >
              <GitGraph row={graphRow}/>
              <span className="git-commit-card">
                <span className="git-commit-content"><span className="git-commit-summary"><span className="git-commit-expander"><Icon name="chevronDown" size={9}/></span><span className="git-commit-subject">{commit.subject}</span>{commit.decorations.length > 0 && <span className="git-decorations">{commit.decorations.slice(0, 3).map((decoration) => <span data-kind={gitDecorationKind(decoration)} key={decoration}><Icon name={decoration.includes("origin/") ? "network" : "git"} size={9}/>{formatGitDecoration(decoration)}</span>)}</span>}</span><span className="git-commit-meta"><span>{commit.author}</span><span>{formatRelativeCommitTime(commit.timestamp)}</span><span>{commit.oid.slice(0, 7)}</span></span></span>
              </span>
            </button>
            <div className={`git-commit-details-shell${expanded ? " expanded" : ""}`} aria-hidden={!expanded} inert={!expanded || undefined}>
              <div className="git-commit-details">
                <GitGraphContinuation row={graphRow}/>
                <div className="git-commit-file-panel">{retainDetails && <GitCommitFiles commit={commit} state={fileState} onRetry={() => void requestCommitFiles(commit, true)}/>}</div>
              </div>
            </div>
            {index < snapshot.commits.length - 1 && <GitGraphBridge row={graphRow}/>}
          </div>;
        })}
        {snapshot && snapshot.commits.length === 0 && <div className="git-clean-state">提交后将在这里显示分支图</div>}
      </div>
    </GitSection>
  </div>
    {inspectedCommit && createPortal(<GitCommitTooltip
      commit={inspectedCommit}
      fileCount={inspectedCommitFileCount}
      tooltipId={commitTooltipId}
      tooltipRef={commitTooltipRef}
    />, document.body)}
    {visible && repositoryOverlay && createPortal(renderRepositoryOverlay(), document.body)}
  </>;
}

function GitCommitTooltip({ commit, fileCount, tooltipId, tooltipRef }: {
  commit: GitCommit;
  fileCount?: number;
  tooltipId: string;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}) {
  const body = commit.body.trim();
  const exactTime = commit.timestamp ? new Date(commit.timestamp * 1000) : null;
  const authorMark = Array.from(commit.author.trim())[0]?.toLocaleUpperCase() ?? "?";
  const references = commit.decorations.map(formatGitDecoration).filter(Boolean);
  const parentSummary = commit.parents.length === 0
    ? "初始提交"
    : `${commit.parents.length} 个父提交`;
  return <div
    ref={tooltipRef}
    id={tooltipId}
    className="git-commit-tooltip"
    role="tooltip"
    data-placement="below"
    style={{ visibility: "hidden" }}
  >
    <div className="git-commit-tooltip-author">
      <span className="git-commit-tooltip-avatar" aria-hidden="true">{authorMark}</span>
      <span><strong>{commit.author}</strong>{exactTime && <time dateTime={exactTime.toISOString()}>{formatCommitDateTime(commit.timestamp)}</time>}</span>
    </div>
    <strong className="git-commit-tooltip-subject">{commit.subject}</strong>
    {body && <div className="git-commit-tooltip-body">{body}</div>}
    <div className="git-commit-tooltip-context">
      <span>{parentSummary}</span>
      {fileCount !== undefined && <span>{fileCount} 个文件</span>}
      {references.length > 0 && <span>{references.join(" · ")}</span>}
    </div>
    <div className="git-commit-tooltip-footer"><Icon name="git" size={10}/><code>{commit.oid.slice(0, 8)}</code></div>
  </div>;
}

function GitGraph({ row }: { row: GitGraphRow }) {
  const centerY = 18;
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-rail"><svg className="git-graph-lanes" aria-hidden="true" width={width} height="36" viewBox={`0 0 ${width} 36`}>
    {row.incoming && <path data-color={row.currentColor} d={`M ${gitGraphLaneX(row.currentLane)} 0 L ${gitGraphLaneX(row.currentLane)} ${centerY}`}/>}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.from}:${segment.to}:${index}`} data-kind={segment.kind} data-color={segment.colorIndex} d={segment.kind === "through"
      ? `M ${gitGraphLaneX(segment.from)} 0 L ${gitGraphLaneX(segment.to)} 36`
      : `M ${gitGraphLaneX(segment.from)} ${centerY} C ${gitGraphLaneX(segment.from)} 25, ${gitGraphLaneX(segment.to)} 29, ${gitGraphLaneX(segment.to)} 36`}/>) }
    <circle data-color={row.currentColor} cx={gitGraphLaneX(row.currentLane)} cy={centerY} r="4"/>
  </svg></span>;
}

function GitGraphContinuation({ row }: { row: GitGraphRow }) {
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-continuation" aria-hidden="true" style={{ width: width + 8 }}><svg width={width}>
    {row.continuingLanes.map((lane) => <line key={`${lane.lane}:${lane.colorIndex}`} data-color={lane.colorIndex} x1={gitGraphLaneX(lane.lane)} y1="0" x2={gitGraphLaneX(lane.lane)} y2="100%"/>)}
  </svg></span>;
}

function GitGraphBridge({ row }: { row: GitGraphRow }) {
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-bridge" aria-hidden="true"><svg width={width} height="100%">
    {row.continuingLanes.map((lane) => <line key={`${lane.lane}:${lane.colorIndex}`} data-color={lane.colorIndex} x1={gitGraphLaneX(lane.lane)} y1="0" x2={gitGraphLaneX(lane.lane)} y2="100%"/>)}
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

function formatCommitDateTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
}

function visibleOperationDetail(detail: string): string {
  return detail
    .replace(/((?:https?|ssh):\/\/)[^/@\s]+@/gi, "$1***@")
    .slice(0, 480);
}

function operationStatusLabel(status: GitOperationRecord["status"]): string {
  if (status === "running") return "进行中";
  if (status === "success") return "成功";
  if (status === "attention") return "需要处理";
  return "失败";
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
