import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import {
  gitAvailable,
  gitError,
  type GitChange,
  type GitCommit,
  type GitCommitFile,
  type GitConflictResolution,
  type GitSnapshot,
  type GitSubmodule,
} from "../lib/tauri/git";
import { gitRepositoryHistoryEntryKey } from "../workspace/gitRepositoryHistory";
import type { GitRepositoryHistoryEntry, GitTarget } from "../workspace/model";
import type { GitRuntime } from "../workspace/WorkspaceProvider";
import { GitCommitGraph, GitCommitTooltip } from "./GitCommitGraph";
import { GitConflictResolver } from "./GitConflictResolver";
import { GitChangePreview } from "./GitChangePreview";
import { buildGitGraphRows } from "./gitGraph";
import { GitChangesSection, GitEmpty, GitRepositorySection, GitSubmodulesSection } from "./GitPaneSections";
import { gitSnapshotsPresentSameState } from "./gitSnapshot";
import { deriveGitPrimaryAction, type GitPrimaryAction, type GitPrimaryAlternativeAction } from "./gitPrimaryAction";
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

type GitChangeScope = "staged" | "unstaged";

interface GitChangeMenuState {
  left: number;
  top: number;
  placement: "above" | "below";
  scope: GitChangeScope;
  paths: string[];
  canStage: boolean;
  canDiscard: boolean;
}

interface GitDiscardConfirmation {
  changes: GitChange[];
}

function discardImpact(changes: GitChange[]): string {
  const untracked = changes.filter((change) => change.status === "U").length;
  const tracked = changes.length - untracked;
  if (tracked > 0 && untracked > 0) return `将把 ${tracked} 个已跟踪文件恢复到暂存区版本，并永久删除 ${untracked} 个未跟踪文件`;
  if (tracked > 0) return `将把 ${tracked} 个已跟踪文件恢复到暂存区版本`;
  return `将永久删除 ${untracked} 个未跟踪文件`;
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
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
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
  const [conflictResolverPath, setConflictResolverPath] = useState<string | null>(null);
  const [previewChange, setPreviewChange] = useState<GitChange | null>(null);
  const [previewCommitFile, setPreviewCommitFile] = useState<{ commit: GitCommit; files: GitCommitFile[]; initialFile: GitCommitFile } | null>(null);
  const [selectedStagedPaths, setSelectedStagedPaths] = useState<Set<string>>(() => new Set());
  const [selectedUnstagedPaths, setSelectedUnstagedPaths] = useState<Set<string>>(() => new Set());
  const [changeMenu, setChangeMenu] = useState<GitChangeMenuState | null>(null);
  const [discardConfirmation, setDiscardConfirmation] = useState<GitDiscardConfirmation | null>(null);
  const [collapsed, setCollapsed] = useState({ repository: false, submodules: false, changes: false, graph: true });
  const epoch = useRef(0);
  const busyRef = useRef("");
  const backgroundRequestRef = useRef<number | null>(null);
  const snapshotRef = useRef<GitSnapshot | null>(null);
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
  const changeMenuRef = useRef<HTMLDivElement>(null);
  const discardReturnFocusRef = useRef<HTMLElement | null>(null);
  const stagedSelectionAnchorRef = useRef<number | null>(null);
  const unstagedSelectionAnchorRef = useRef<number | null>(null);
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
    loadSnapshot, fetchSnapshot, initialize, loadCommitFiles, loadCommitFileDiff, loadChangeDiff, loadConflictDetail, resolveConflict,
    stagePaths, stageAll, unstagePaths, unstageAll, discardPaths, commit, initializeSubmodule, checkoutSubmodule,
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
    backgroundRequestRef.current = null;
    setBackgroundRefreshing(false);
    updateBusy("");
    setRepositoryOverlay(null);
    setRepositorySubmenu(null);
    setCommitContextMenu(null);
    setCommitBranchSource(null);
    setMergeSourceRef("");
    setMergeConfirmation(null);
    setConflictResolverPath(null);
    setPreviewChange(null);
    setPreviewCommitFile(null);
    setSelectedStagedPaths(new Set());
    setSelectedUnstagedPaths(new Set());
    setChangeMenu(null);
    setDiscardConfirmation(null);
    stagedSelectionAnchorRef.current = null;
    unstagedSelectionAnchorRef.current = null;
    setOperations([]);
    if (reportedRepositoryKeyRef.current !== nextTargetKey) reportedRepositoryKeyRef.current = null;
  }, [target, updateBusy]);

  const applySnapshot = useCallback((next: GitSnapshot, preserveEquivalent = false) => {
    setError(null);
    if (preserveEquivalent && snapshotRef.current && gitSnapshotsPresentSameState(snapshotRef.current, next)) return false;
    snapshotRef.current = next;
    setSnapshot(next);
    const eligibleStaged = new Set(next.changes.filter((change) => change.staged && !change.conflict).map((change) => change.path));
    const eligibleUnstaged = new Set(next.changes.filter((change) => !change.staged && !change.conflict).map((change) => change.path));
    setSelectedStagedPaths((current) => {
      const selected = new Set([...current].filter((path) => eligibleStaged.has(path)));
      return selected.size === current.size ? current : selected;
    });
    setSelectedUnstagedPaths((current) => {
      const selected = new Set([...current].filter((path) => eligibleUnstaged.has(path)));
      return selected.size === current.size ? current : selected;
    });
    setChangeMenu((current) => {
      if (!current) return null;
      const eligible = current.scope === "staged" ? eligibleStaged : eligibleUnstaged;
      return current.paths.some((path) => !eligible.has(path)) ? null : current;
    });
    const repository: GitRepositoryHistoryEntry = remote && remoteProfileId
      ? { type: "remote", profileId: remoteProfileId, path: next.repositoryPath }
      : { type: "local", path: next.repositoryPath };
    const repositoryKey = gitRepositoryHistoryEntryKey(repository);
    if (reportedRepositoryKeyRef.current !== repositoryKey) {
      reportedRepositoryKeyRef.current = repositoryKey;
      onRepositoryOpenedRef.current?.(repository);
    }
    if (next.repositoryPath !== repositoryPath && !remote) onTargetChangeRef.current({ type: "local", path: next.repositoryPath });
    return true;
  }, [remote, remoteProfileId, repositoryPath]);

  const refreshSnapshot = useCallback(async () => {
    if (!repositoryPath || !visible || !remoteReady || !available || document.visibilityState === "hidden") return;
    if (busyRef.current || backgroundRequestRef.current !== null) return;
    const request = ++epoch.current;
    backgroundRequestRef.current = request;
    setBackgroundRefreshing(true);
    try {
      const next = await loadSnapshot(repositoryPath);
      if (request === epoch.current) applySnapshot(next, true);
    } catch (cause) {
      if (request === epoch.current) setError(gitError(cause));
    } finally {
      if (backgroundRequestRef.current === request) {
        backgroundRequestRef.current = null;
        setBackgroundRefreshing(false);
      }
    }
  }, [applySnapshot, available, loadSnapshot, remoteReady, repositoryPath, visible]);

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
  useEffect(() => {
    if (!visible || !available) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [available, refreshSnapshot, visible]);
  useEffect(() => {
    if (!visible || !available) return;
    const timer = window.setInterval(() => void refreshSnapshot(), 15_000);
    return () => window.clearInterval(timer);
  }, [available, refreshSnapshot, visible]);
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
  const previewChanges = useMemo(() => [...staged, ...unstaged], [staged, unstaged]);

  useEffect(() => {
    if (!changeMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".git-change-context-menu")) setChangeMenu(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setChangeMenu(null);
      window.requestAnimationFrame(() => discardReturnFocusRef.current?.focus());
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.setTimeout(() => changeMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [changeMenu]);

  function selectChange(scope: GitChangeScope, change: GitChange, index: number, event: ReactMouseEvent<HTMLButtonElement>) {
    setChangeMenu(null);
    const changes = scope === "staged" ? staged : unstaged;
    const anchorRef = scope === "staged" ? stagedSelectionAnchorRef : unstagedSelectionAnchorRef;
    const setSelectedPaths = scope === "staged" ? setSelectedStagedPaths : setSelectedUnstagedPaths;
    setSelectedPaths((current) => {
      if (event.shiftKey && anchorRef.current !== null) {
        const start = Math.min(anchorRef.current, index);
        const end = Math.max(anchorRef.current, index);
        const next = event.ctrlKey || event.metaKey ? new Set(current) : new Set<string>();
        changes.slice(start, end + 1).forEach((item) => next.add(item.path));
        return next;
      }
      anchorRef.current = index;
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(current);
        if (next.has(change.path)) next.delete(change.path); else next.add(change.path);
        return next;
      }
      return new Set([change.path]);
    });
  }

  function openChangeMenu(scope: GitChangeScope, change: GitChange, index: number, event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    discardReturnFocusRef.current = event.currentTarget instanceof HTMLButtonElement
      ? event.currentTarget
      : event.currentTarget.querySelector<HTMLButtonElement>(".git-change-preview-trigger");
    const changes = scope === "staged" ? staged : unstaged;
    const selectedPaths = scope === "staged" ? selectedStagedPaths : selectedUnstagedPaths;
    const setSelectedPaths = scope === "staged" ? setSelectedStagedPaths : setSelectedUnstagedPaths;
    const anchorRef = scope === "staged" ? stagedSelectionAnchorRef : unstagedSelectionAnchorRef;
    let paths = selectedPaths.has(change.path)
      ? changes.filter((item) => selectedPaths.has(item.path)).map((item) => item.path)
      : [change.path];
    if (!selectedPaths.has(change.path)) {
      setSelectedPaths(new Set(paths));
      anchorRef.current = index;
    }
    if (paths.length === 0) paths = [change.path];
    const keyboard = "key" in event;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = keyboard ? rect.left + 18 : event.clientX;
    const anchorY = keyboard ? rect.top + rect.height / 2 : event.clientY;
    const menuHeight = scope === "unstaged" ? 68 : 38;
    const selectedChanges = paths
      .map((path) => changes.find((item) => item.path === path))
      .filter((item): item is GitChange => Boolean(item));
    setChangeMenu({
      ...fitCommitContextMenu(anchorX, anchorY, 210, menuHeight),
      scope,
      paths,
      canStage: selectedChanges.every((item) => !item.submodule || item.submodule.commitChanged),
      canDiscard: selectedChanges.every((item) => !item.submodule),
    });
  }

  function runChangeMenuAction(action: "stage" | "unstage") {
    if (!root || !changeMenu || busyRef.current) return;
    if (action === "stage" && (changeMenu.scope !== "unstaged" || !changeMenu.canStage)) return;
    if (action === "unstage" && changeMenu.scope !== "staged") return;
    const paths = changeMenu.paths;
    setChangeMenu(null);
    if (action === "stage") void mutate("stage", () => stagePaths(root, paths));
    else void mutate("unstage", () => unstagePaths(root, paths));
  }

  function requestDiscardConfirmation() {
    if (!changeMenu || changeMenu.scope !== "unstaged" || !changeMenu.canDiscard) return;
    const selected = changeMenu.paths
      .map((path) => unstaged.find((change) => change.path === path))
      .filter((change): change is GitChange => Boolean(change));
    setChangeMenu(null);
    setError(null);
    if (selected.length > 0) setDiscardConfirmation({ changes: selected });
  }

  async function confirmDiscard() {
    if (!root || !discardConfirmation || busyRef.current) return;
    const paths = discardConfirmation.changes.map((change) => change.path);
    const request = ++epoch.current;
    updateBusy("discard");
    setError(null);
    try {
      const next = await discardPaths(root, paths);
      if (request !== epoch.current) return;
      applySnapshot(next);
      setDiscardConfirmation(null);
      setSelectedUnstagedPaths(new Set());
      unstagedSelectionAnchorRef.current = null;
    } catch (cause) {
      const failure = gitError(cause);
      if (request === epoch.current) {
        await recoverSnapshotAfterFailure(request, failure);
        setDiscardConfirmation(null);
        window.requestAnimationFrame(() => discardReturnFocusRef.current?.focus());
      }
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }

  function closeDiscardConfirmation() {
    if (busyRef.current === "discard") return;
    setDiscardConfirmation(null);
    window.requestAnimationFrame(() => discardReturnFocusRef.current?.focus());
  }
  const graphRows = useMemo(() => buildGitGraphRows(snapshot?.commits ?? []), [snapshot]);
  const root = snapshot?.repositoryPath ?? repositoryPath;
  const {
    activeCommitOid, commitAnchorRefs, commitFilesCache, commitFilesKey, expandedCommitKey,
    commitTooltipId, commitTooltipRef, inspectedCommit, inspectedCommitFileCount,
    requestCommitFiles, setFocusedCommitOid, setHoveredCommitOid, toggleCommitFiles,
  } = useGitCommitInspection({ visible, snapshot, root, remote, remoteProfileId, loadCommitFiles });
  const disabled = Boolean(busy) || !remoteReady;
  const submodules = snapshot?.submodules ?? [];
  const primaryAction = deriveGitPrimaryAction({
    snapshot,
    message,
    busy,
    unavailable: !root || !remoteReady,
  });
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

  function loadConflictForDialog(path: string) {
    if (!root) return Promise.reject(new Error("Git 仓库尚未加载"));
    return loadConflictDetail(root, path);
  }

  function loadChangeForDialog(path: string, staged: boolean) {
    if (!root) return Promise.reject(new Error("Git 仓库尚未加载"));
    return loadChangeDiff(root, path, staged);
  }

  function loadCommitFileForDialog(oid: string, path: string) {
    if (!root) return Promise.reject(new Error("Git 仓库尚未加载"));
    return loadCommitFileDiff(root, oid, path);
  }

  async function resolveConflictFromDialog(path: string, resolution: GitConflictResolution): Promise<GitSnapshot> {
    if (!root || busyRef.current) throw new Error("Git 正在执行其他操作");
    const request = ++epoch.current;
    updateBusy("resolveConflict");
    setError(null);
    try {
      const next = await resolveConflict(root, path, resolution);
      if (request !== epoch.current) throw new Error("仓库状态已变化，请重新打开冲突解决器");
      applySnapshot(next);
      return next;
    } catch (cause) {
      const failure = gitError(cause);
      if (request === epoch.current) {
        setError(failure);
        await recoverSnapshotAfterFailure(request, failure);
      }
      throw failure;
    } finally {
      if (request === epoch.current) updateBusy("");
    }
  }

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

  function runPrimaryAction(action: GitPrimaryAction | GitPrimaryAlternativeAction) {
    if (!root || busyRef.current || ("disabled" in action && action.disabled)) return;
    if (action.kind === "stageAll") {
      void mutate("stageAll", () => stageAll(root));
    } else if (action.kind === "commit") {
      const commitMessage = message.trim();
      if (commitMessage) void mutate("commit", () => commit(root, commitMessage), true);
    } else if (action.kind === "push") {
      void runRecordedOperation("推送", () => pushRepository(root, null), "Push 已完成");
    } else if (action.kind === "pull") {
      void runRecordedOperation("拉取", () => pullRepository(root), "FF-only Pull 已完成");
    } else if (action.kind === "publish" && action.remote) {
      void runRecordedOperation("发布分支", () => pushRepository(root, action.remote), `已发布到 ${action.remote} 并设置 upstream`);
    } else if (action.kind === "chooseRemote") {
      openRepositoryOverlay("publishBranch");
    }
  }

  function submoduleTarget(submodule: GitSubmodule): GitTarget | null {
    if (!root || submodule.path.startsWith("/") || submodule.path.split("/").includes("..")) return null;
    const path = `${root.replace(/[\\/]+$/, "")}/${submodule.path}`;
    return remote && remoteProfileId
      ? { type: "remote", profileId: remoteProfileId, path }
      : { type: "local", path };
  }

  function openSubmodule(submodule: GitSubmodule) {
    const next = submoduleTarget(submodule);
    if (next) onTargetChangeRef.current(next);
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
      updating={backgroundRefreshing || busy === "fetch"}
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
    {snapshot && <GitSubmodulesSection
      submodules={submodules}
      collapsed={collapsed.submodules}
      disabled={disabled}
      onToggle={() => setCollapsed((value) => ({ ...value, submodules: !value.submodules }))}
      onOpen={openSubmodule}
      onInitialize={(submodule) => root && void runRecordedOperation("初始化子仓库", () => initializeSubmodule(root, submodule.path), `已初始化 ${submodule.path}`)}
      onCheckout={(submodule) => root && void runRecordedOperation("检出子仓库记录版本", () => checkoutSubmodule(root, submodule.path), `已检出 ${submodule.path} 的记录版本`)}
    />}
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
      primaryAction={primaryAction}
      onToggle={() => toggleExclusiveSection("changes")}
      onMessageChange={setMessage}
      onStageAll={() => root && void mutate("stageAll", () => stageAll(root))}
      onUnstageAll={() => root && void mutate("unstageAll", () => unstageAll(root))}
      onPrimaryAction={runPrimaryAction}
      onStage={(change) => root && void mutate("stage", () => stagePaths(root, [change.path]))}
      onPreviewChange={(change) => {
        setPreviewCommitFile(null);
        setPreviewChange(change);
      }}
      onResolveConflict={(change) => setConflictResolverPath(change.path)}
      onUnstage={(change) => root && void mutate("unstage", () => unstagePaths(root, [change.path]))}
      selectedStagedPaths={selectedStagedPaths}
      selectedUnstagedPaths={selectedUnstagedPaths}
      onSelectStaged={(change, index, event) => selectChange("staged", change, index, event)}
      onSelectUnstaged={(change, index, event) => selectChange("unstaged", change, index, event)}
      onOpenStagedMenu={(change, index, event) => openChangeMenu("staged", change, index, event)}
      onOpenUnstagedMenu={(change, index, event) => openChangeMenu("unstaged", change, index, event)}
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
      onPreviewFile={(commitToPreview, file, files) => {
        setPreviewChange(null);
        setPreviewCommitFile({ commit: commitToPreview, files, initialFile: file });
      }}
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
    {visible && changeMenu && createPortal(<div ref={changeMenuRef} className="git-repository-popover git-repository-action-popover git-commit-context-menu git-change-context-menu" role="menu" aria-label="Git 更改操作" data-placement={changeMenu.placement} style={{ left: changeMenu.left, top: changeMenu.top }} onKeyDown={navigateRepositoryMenu} onContextMenu={(event) => event.preventDefault()}>
      {changeMenu.scope === "unstaged"
        ? <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled || !changeMenu.canStage} title={changeMenu.canStage ? undefined : "子仓库内部修改不会改变父仓库 gitlink"} onClick={() => runChangeMenuAction("stage")}><Icon name="plus" size={12}/><span>{changeMenu.paths.length === 1 ? "添加到暂存区" : `将 ${changeMenu.paths.length} 个文件添加到暂存区`}</span></button>
        : <button type="button" className="git-repository-action-item" role="menuitem" disabled={disabled} onClick={() => runChangeMenuAction("unstage")}><Icon name="clear" size={12}/><span>{changeMenu.paths.length === 1 ? "取消暂存" : `取消暂存 ${changeMenu.paths.length} 个文件`}</span></button>}
      {changeMenu.scope === "unstaged" && <button type="button" className="git-repository-action-item danger" role="menuitem" disabled={disabled || !changeMenu.canDiscard} title={changeMenu.canDiscard ? undefined : "请打开子仓库处理内部修改，或使用检出记录版本恢复引用"} onClick={requestDiscardConfirmation}><Icon name="trash" size={12}/><span>{changeMenu.paths.length === 1 ? "抛弃更改" : `抛弃 ${changeMenu.paths.length} 个文件的更改`}</span></button>}
    </div>, document.body)}
    {visible && discardConfirmation && createPortal(<DialogFrame title={`抛弃 ${discardConfirmation.changes.length} 个文件的更改？`} subtitle="工作区更改" compact className="git-discard-confirmation" dismissible={busy !== "discard"} onClose={closeDiscardConfirmation}>
      <div className="git-discard-confirmation-body">
        <p className="confirm-copy">{discardImpact(discardConfirmation.changes)}。已暂存的更改和现有提交不会受到影响。此操作无法由 Qterm 撤销。</p>
        <ul className="git-discard-file-list">{discardConfirmation.changes.slice(0, 5).map((change) => <li key={change.path}><Icon name="file" size={12}/><code title={change.path}>{change.path}</code><span>{change.status === "U" ? "删除" : "恢复"}</span></li>)}</ul>
        {discardConfirmation.changes.length > 5 && <p className="git-discard-remainder">另有 {discardConfirmation.changes.length - 5} 项</p>}
      </div>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={error?.message ?? ""}/><div><Button data-dialog-autofocus disabled={busy === "discard"} onClick={closeDiscardConfirmation}>取消</Button><Button variant="dangerSolid" loading={busy === "discard"} onClick={() => void confirmDiscard()}>确认抛弃 {discardConfirmation.changes.length} 个更改</Button></div></footer>
    </DialogFrame>, document.body)}
    {conflictResolverPath && snapshot && <GitConflictResolver
      conflicts={conflicts}
      initialPath={conflictResolverPath}
      repositoryName={snapshot.repositoryName}
      mergeHeadOid={snapshot.mergeHeadOid}
      onLoad={loadConflictForDialog}
      onResolve={resolveConflictFromDialog}
      onClose={() => setConflictResolverPath(null)}
    />}
    {previewChange && snapshot && <GitChangePreview
      changes={previewChanges}
      initialChange={previewChange}
      repositoryName={snapshot.repositoryName}
      onLoad={loadChangeForDialog}
      onClose={() => setPreviewChange(null)}
    />}
    {previewCommitFile && snapshot && <GitChangePreview
      commit={previewCommitFile.commit}
      files={previewCommitFile.files}
      initialFile={previewCommitFile.initialFile}
      repositoryName={snapshot.repositoryName}
      onLoadCommit={(path) => loadCommitFileForDialog(previewCommitFile.commit.oid, path)}
      onClose={() => setPreviewCommitFile(null)}
    />}
  </>;
}
