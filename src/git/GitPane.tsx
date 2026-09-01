import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  gitAvailable,
  gitError,
  type GitCommit,
  type GitSnapshot,
} from "../lib/tauri/git";
import { gitRepositoryHistoryEntryKey } from "../workspace/gitRepositoryHistory";
import type { GitRepositoryHistoryEntry, GitTarget } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { GitCommitGraph, GitCommitTooltip } from "./GitCommitGraph";
import { buildGitGraphRows } from "./gitGraph";
import { GitChangesSection, GitEmpty, GitRepositorySection } from "./GitPaneSections";
import {
  branchOverlayKinds,
  gitFailureTitle,
  visibleOperationDetail,
  type GitCommitContextMenu as GitCommitContextMenuState,
  type GitMergeConfirmation,
  type GitOperationRecord,
  type GitRepositoryOverlay,
  type GitRepositoryOverlayKind,
  type GitRepositorySubmenu,
} from "./gitPaneTypes";
import { useGitRepositoryClient } from "./gitRepositoryClient";
import { GitCommitContextMenu, GitRepositoryOverlays } from "./GitRepositoryOverlays";
import { useGitCommitInspection } from "./useGitCommitInspection";

interface GitPaneProps {
  blockId: string;
  target: GitTarget;
  runtime?: GitRuntime;
  visible: boolean;
  onTargetChange: (target: GitTarget) => void;
  onRequestRepositoryChange?: () => void;
  onRepositoryOpened?: (repository: GitRepositoryHistoryEntry) => void;
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

function fitCommitContextMenu(anchorX: number, anchorY: number, width: number, height: number): Pick<GitCommitContextMenuState, "left" | "top" | "placement"> {
  const gutter = 8;
  const left = Math.max(gutter, Math.min(anchorX, window.innerWidth - width - gutter));
  if (anchorY + height <= window.innerHeight - gutter) return { left, top: Math.max(gutter, anchorY), placement: "below" };
  return { left, top: Math.max(gutter, anchorY - height), placement: "above" };
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
  const [mergeConfirmation, setMergeConfirmation] = useState<GitMergeConfirmation | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [operations, setOperations] = useState<GitOperationRecord[]>([]);
  const [repositoryOverlay, setRepositoryOverlay] = useState<GitRepositoryOverlay | null>(null);
  const [repositorySubmenu, setRepositorySubmenu] = useState<GitRepositorySubmenu | null>(null);
  const [commitContextMenu, setCommitContextMenu] = useState<GitCommitContextMenuState | null>(null);
  const [commitBranchSource, setCommitBranchSource] = useState<GitCommit | null>(null);
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
  const commitContextMenuRef = useRef<HTMLDivElement | null>(null);
  const branchManagementItemRef = useRef<HTMLButtonElement>(null);
  const mergeAbortButtonRef = useRef<HTMLButtonElement>(null);
  const previousMergeStateRef = useRef(false);
  const operationSequence = useRef(0);
  const repositorySubmenuId = useId();
  const repositoryPath = target.type === "unbound" ? null : target.path;
  const remote = target.type === "remote";
  const remoteProfileId = target.type === "remote" ? target.profileId : null;
  const remoteSessionId = runtime?.sessionId;
  const remoteStatus = runtime?.status;
  const remoteReady = !remote || runtime?.status === "connected";
  const available = remote ? true : localAvailable;
  const {
    loadSnapshot, fetchSnapshot, initialize, loadCommitFiles,
    stagePaths, stageAll, unstagePaths, unstageAll, commit,
    createBranch, createBranchAt, createBranchFromCommit, renameBranch, deleteBranch, switchBranch, trackRemoteBranch,
    pullRepository, pushRepository, mergeBranch, continueMerge, abortMerge,
  } = useGitRepositoryClient({ remote, profileId: remoteProfileId, sessionId: remoteSessionId, status: remoteStatus });

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
    setCommitContextMenu(null);
    setCommitBranchSource(null);
    setMergeSourceRef("");
    setMergeConfirmation(null);
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

  async function confirmMergeOperation() {
    const confirmation = mergeConfirmation;
    if (!confirmation || busyRef.current) return;
    const succeeded = await runMergeOperation(confirmation.sourceRef);
    if (succeeded) closeRepositoryOverlay(true);
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
  const root = snapshot?.repositoryPath ?? repositoryPath;
  const {
    activeCommitOid, commitAnchorRefs, commitFilesCache, commitFilesKey, expandedCommitKey,
    commitTooltipId, commitTooltipRef, inspectedCommit, inspectedCommitFileCount,
    requestCommitFiles, setFocusedCommitOid, setHoveredCommitOid, toggleCommitFiles,
  } = useGitCommitInspection({ visible, snapshot, root, remote, remoteProfileId, loadCommitFiles });
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
  const commitAnchors = commitAnchorRefs.current;

  useEffect(() => {
    if (mergeInProgress && !previousMergeStateRef.current) {
      setCollapsed((value) => ({ ...value, changes: false, graph: true }));
    }
    previousMergeStateRef.current = mergeInProgress;
  }, [mergeInProgress]);

  const repositoryAnchor = useCallback((kind = repositoryOverlay?.kind): HTMLButtonElement | null => {
    if (kind === "abortMerge") return mergeAbortButtonRef.current;
    if (kind === "createBranchFromCommit" && commitBranchSource) return commitAnchors.get(commitBranchSource.oid) ?? null;
    return kind && branchOverlayKinds.has(kind) ? branchButtonRef.current : repositoryActionsButtonRef.current;
  }, [commitAnchors, commitBranchSource, repositoryOverlay?.kind]);

  function openCommitContextMenu(commit: GitCommit, anchorX: number, anchorY: number) {
    setRepositoryOverlay(null);
    setRepositorySubmenu(null);
    setMergeConfirmation(null);
    setHoveredCommitOid(null);
    setFocusedCommitOid(null);
    setCommitContextMenu({
      commit,
      anchorX,
      anchorY,
      ...fitCommitContextMenu(anchorX, anchorY, 232, 72),
    });
  }

  function openCommitBranchOverlay(commit: GitCommit) {
    const anchor = commitAnchorRefs.current.get(commit.oid);
    if (!anchor) return;
    setCommitContextMenu(null);
    setCommitBranchSource(commit);
    setNewBranch("");
    setError(null);
    setRepositoryOverlay({
      kind: "createBranchFromCommit",
      ...fitRepositoryOverlay(anchor.getBoundingClientRect(), 292, 202),
    });
  }

  function closeRepositoryOverlay(restoreFocus = false) {
    const anchor = repositoryOverlay ? repositoryAnchor(repositoryOverlay.kind) : null;
    setMergeConfirmation(null);
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
    if (kind === "mergeBranch") {
      setMergeConfirmation(null);
      setMergeSourceRef(mergeSourceOptions[0]?.refName ?? "");
    }
    const estimatedWidth = kind === "branches" ? 336 : kind === "repositoryActions" ? 210 : kind === "mergeBranch" ? 420 : 292;
    const estimatedHeight = kind === "branches"
      ? Math.min(376, 118 + branchOptions.length * 44)
      : kind === "operationLog" ? 300 : kind === "repositoryActions" ? 222 : kind === "mergeBranch" ? 184 : 190;
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
    if (!commitContextMenu || !commitContextMenuRef.current) return;
    const menu = commitContextMenuRef.current;
    const next = fitCommitContextMenu(commitContextMenu.anchorX, commitContextMenu.anchorY, menu.offsetWidth, menu.offsetHeight);
    setCommitContextMenu((current) => {
      if (!current || current.commit.oid !== commitContextMenu.commit.oid) return current;
      if (current.left === next.left && current.top === next.top && current.placement === next.placement) return current;
      return { ...current, ...next };
    });
  }, [commitContextMenu]);

  useEffect(() => {
    if (!commitContextMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!commitContextMenuRef.current?.contains(node)) setCommitContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const anchor = commitAnchors.get(commitContextMenu.commit.oid);
      setCommitContextMenu(null);
      window.requestAnimationFrame(() => anchor?.focus());
    };
    const closeOnViewportChange = () => setCommitContextMenu(null);
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
  }, [commitAnchors, commitContextMenu]);

  useEffect(() => {
    if (!commitContextMenu) return;
    window.requestAnimationFrame(() => commitContextMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
  }, [commitContextMenu]);

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
    if (!repositoryOverlay || mergeConfirmation) return;
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
  }, [mergeConfirmation, repositoryAnchor, repositoryOverlay, repositorySubmenu]);

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

  if (available === false) return <GitEmpty icon="git" title="未找到系统 Git" detail="安装 Git 并重新打开 Qterm 后即可使用 Git 管理。"/>;
  if (!repositoryPath) return <GitEmpty icon="git" title="选择本机仓库" detail="Git Block 一次管理一个本机或 SSH 工作区仓库。" action="选择文件夹" onAction={onRequestRepositoryChange}/>;
  if (remote && !remoteReady && !snapshot) return <GitEmpty icon="git" title={runtime?.status === "connecting" || runtime?.status === "authenticating" ? "正在连接远程 Git…" : "远程 Git 尚未连接"} detail={runtime?.notice || repositoryPath} secondary="更换远程路径" onSecondary={onRequestRepositoryChange}/>;
  if (error?.code === "notGitRepository") return <GitEmpty icon="git" title="尚未初始化存储库" detail={repositoryPath} action="初始化存储库" secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void mutate("initialize", () => initialize(repositoryPath))} onSecondary={onRequestRepositoryChange}/>;
  if (error && !snapshot) return <GitEmpty icon="git" title={gitFailureTitle(error.code)} detail={error.message} action={error.code === "gitMissing" || error.code === "gitUnsupportedRemote" ? undefined : "重试"} secondary={remote ? "更换远程路径" : "更换文件夹"} onAction={() => void refreshSnapshot()} onSecondary={onRequestRepositoryChange}/>;

  return <><div className="git-pane" data-block-id={blockId} data-busy={disabled || undefined} aria-busy={disabled}>
    <GitRepositorySection
      root={root}
      repositoryPath={repositoryPath}
      snapshot={snapshot}
      collapsed={collapsed.repository}
      branchLabel={branchLabel}
      mergeInProgress={mergeInProgress}
      disabled={disabled}
      busy={busy}
      remote={remote}
      remoteReady={remoteReady}
      runtime={runtime}
      error={error}
      repositoryOverlay={repositoryOverlay}
      branchButtonRef={branchButtonRef}
      repositoryActionsButtonRef={repositoryActionsButtonRef}
      onToggle={() => setCollapsed((value) => ({ ...value, repository: !value.repository }))}
      onFetch={() => void fetchAndRefresh()}
      onOpenOverlay={openRepositoryOverlay}
    />
    <GitChangesSection
      snapshot={snapshot}
      collapsed={collapsed.changes}
      disabled={disabled}
      mergeInProgress={mergeInProgress}
      root={root}
      message={message}
      error={error}
      staged={staged}
      unstaged={unstaged}
      conflicts={conflicts}
      messageRef={messageRef}
      mergeAbortButtonRef={mergeAbortButtonRef}
      onToggle={() => toggleExclusiveSection("changes")}
      onMessageChange={setMessage}
      onStageAll={() => root && void mutate("stageAll", () => stageAll(root))}
      onUnstageAll={() => root && void mutate("unstageAll", () => unstageAll(root))}
      onCommit={() => root && void mutate("commit", () => commit(root, message.trim()), true)}
      onStage={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}
      onUnstage={(change) => root && void mutate("unstage", () => unstagePaths(root, [change.path]))}
      onContinueMerge={() => root && void runRecordedOperation("继续合并", () => continueMerge(root), "合并提交已完成")}
      onAbortMerge={() => openRepositoryOverlay("abortMerge")}
    />
    <GitCommitGraph
      snapshot={snapshot}
      graphRows={graphRows}
      collapsed={collapsed.graph}
      activeCommitOid={activeCommitOid}
      expandedCommitKey={expandedCommitKey}
      commitFilesCache={commitFilesCache}
      inspectedCommitOid={inspectedCommit?.oid}
      tooltipId={commitTooltipId}
      commitAnchorRefs={commitAnchorRefs}
      setHoveredCommitOid={setHoveredCommitOid}
      setFocusedCommitOid={setFocusedCommitOid}
      getCommitFilesKey={commitFilesKey}
      onToggle={() => toggleExclusiveSection("graph")}
      onToggleCommit={toggleCommitFiles}
      onOpenCommitMenu={openCommitContextMenu}
      onRetryCommit={(commitToRetry) => void requestCommitFiles(commitToRetry, true)}
    />
  </div>
    {inspectedCommit && !commitContextMenu && repositoryOverlay?.kind !== "createBranchFromCommit" && createPortal(<GitCommitTooltip
      commit={inspectedCommit}
      fileCount={inspectedCommitFileCount}
      tooltipId={commitTooltipId}
      tooltipRef={commitTooltipRef}
    />, document.body)}
    {visible && <GitCommitContextMenu
      menu={commitContextMenu}
      menuRef={commitContextMenuRef}
      disabled={disabled || mergeInProgress}
      onNavigateMenu={navigateRepositoryMenu}
      onCreateBranch={openCommitBranchOverlay}
    />}
    <GitRepositoryOverlays
      visible={visible}
      blockId={blockId}
      snapshot={snapshot}
      root={root}
      repositoryOverlay={repositoryOverlay}
      repositorySubmenu={repositorySubmenu}
      mergeConfirmation={mergeConfirmation}
      commitBranchSource={commitBranchSource}
      repositoryOverlayRef={repositoryOverlayRef}
      repositorySubmenuRef={repositorySubmenuRef}
      branchManagementItemRef={branchManagementItemRef}
      repositorySubmenuId={repositorySubmenuId}
      branchQuery={branchQuery}
      newBranch={newBranch}
      branchSourceRef={branchSourceRef}
      selectedBranchRef={selectedBranchRef}
      selectedRemote={selectedRemote}
      mergeSourceRef={mergeSourceRef}
      branchLabel={branchLabel}
      disabled={disabled}
      busy={busy}
      error={error}
      mergeInProgress={mergeInProgress}
      mergeWorktreeClean={mergeWorktreeClean}
      branchOptions={branchOptions}
      visibleBranches={visibleBranches}
      visibleLocalBranches={visibleLocalBranches}
      visibleRemoteBranches={visibleRemoteBranches}
      localBranchOptions={localBranchOptions}
      deletableBranchOptions={deletableBranchOptions}
      mergeSourceOptions={mergeSourceOptions}
      selectedMergeSource={selectedMergeSource}
      operations={operations}
      onBranchQueryChange={setBranchQuery}
      onNewBranchChange={setNewBranch}
      onBranchSourceRefChange={setBranchSourceRef}
      onSelectedBranchRefChange={setSelectedBranchRef}
      onSelectedRemoteChange={setSelectedRemote}
      onMergeSourceRefChange={setMergeSourceRef}
      onMergeConfirmationChange={setMergeConfirmation}
      onOpenOverlay={openRepositoryOverlay}
      onCloseOverlay={closeRepositoryOverlay}
      onOpenBranchSubmenu={openBranchManagementSubmenu}
      onCloseBranchSubmenu={closeBranchManagementSubmenu}
      onDismissBranchSubmenu={() => setRepositorySubmenu(null)}
      onNavigateMenu={navigateRepositoryMenu}
      onSelectBranch={(branch, current) => {
        closeRepositoryOverlay(false);
        if (!root || current) return;
        if (branch.kind === "remote") void mutate("trackRemoteBranch", () => trackRemoteBranch(root, branch.refName));
        else void mutate("switch", () => switchBranch(root, branch.name));
      }}
      onCreateBranch={(name) => root
        ? runRecordedOperation("创建分支", () => createBranch(root, name), "已从当前 HEAD 创建并切换")
        : Promise.resolve(false)}
      onPull={() => {
        closeRepositoryOverlay(false);
        if (root) void runRecordedOperation("拉取", () => pullRepository(root), "FF-only Pull 已完成");
      }}
      onPush={() => {
        closeRepositoryOverlay(false);
        if (root) void runRecordedOperation("推送", () => pushRepository(root, null), "Push 已完成");
      }}
      onSynchronize={() => {
        closeRepositoryOverlay(false);
        void synchronizeRepository();
      }}
      onCreateBranchAt={(name, sourceRef) => root
        ? runRecordedOperation("从分支创建", () => createBranchAt(root, name, sourceRef), `已从 ${sourceRef} 创建`)
        : Promise.resolve(false)}
      onCreateBranchFromCommit={(name, oid) => root
        ? runRecordedOperation("从提交创建分支", () => createBranchFromCommit(root, name, oid), `已从 ${oid.slice(0, 8)} 创建并切换`)
        : Promise.resolve(false)}
      onRenameBranch={(refName, name) => root
        ? runRecordedOperation("重命名分支", () => renameBranch(root, refName, name), "本地分支已重命名")
        : Promise.resolve(false)}
      onDeleteBranch={(refName) => root
        ? runRecordedOperation("安全删除分支", () => deleteBranch(root, refName), "已使用非强制删除")
        : Promise.resolve(false)}
      onPublishBranch={(remoteName) => root
        ? runRecordedOperation("发布分支", () => pushRepository(root, remoteName), `已发布到 ${remoteName} 并设置 upstream`)
        : Promise.resolve(false)}
      onAbortMerge={() => root
        ? runRecordedOperation("中止合并", () => abortMerge(root), "未完成的合并已中止")
        : Promise.resolve(false)}
      onConfirmMerge={() => void confirmMergeOperation()}
    />
  </>;
}
