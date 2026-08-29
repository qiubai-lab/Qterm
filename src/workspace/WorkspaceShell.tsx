import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { resolveAppShortcut, shortcutLabel } from "../app/shortcuts";
import { IconButton } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";
import { ConnectionDialog } from "../components/dialogs/ConnectionDialog";
import { CredentialDialog } from "../components/dialogs/CredentialDialog";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { HelpDialog } from "../components/dialogs/InfoDialogs";
import { SettingsDialog } from "../components/dialogs/SettingsDialog";
import { ConnectionAuthDialog } from "../components/dialogs/ConnectionAuthDialog";
import { MasterPasswordDialog, type MasterPasswordMode } from "../components/dialogs/MasterPasswordDialog";
import { TerminalLockChoiceDialog, TerminalLockScreen } from "../components/dialogs/TerminalLockDialogs";
import { getVaultStatus, lockVault, onVaultStatusChanged, type VaultStatus } from "../lib/tauri/credentials";
import { getProfileRouteRequirements, type ConnectionProfile } from "../lib/tauri/profiles";
import { getSettings, updateUpdateSettings, type SecuritySettings, type TerminalSettings, type UpdateSettings } from "../lib/tauri/settings";
import { checkForUpdateOnStartupOnce } from "../lib/updateCheck";
import { closeCurrentWindow, currentDesktopPlatform, isCurrentWindowAlwaysOnTop, minimizeCurrentWindow, setCurrentWindowAlwaysOnTop, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";
import { TERMINAL_ATTENTION_MS } from "../terminal/terminalAttention";
import { focusTerminalBlock, openTerminalSearch } from "../terminal/terminalViewRegistry";
import { WorkspaceCanvas, type ConnectionOwner } from "./LayoutView";
import { resolveConfiguredAuth } from "./configuredAuth";
import { adjacentBlockId } from "./blockNavigation";
import { blockIds } from "./layout";
import { openFileWindowAction } from "./fileWindow";
import type { LayoutNode, Workspace } from "./model";
import { openNetworkWindowAction } from "./networkWindow";
import { useWorkspace } from "./WorkspaceProvider";

type Tool = "connections" | "credentials" | "settings" | "help";
type WorkspaceTransitionDirection = "forward" | "backward";
interface CloseRequest { title: string; detail: string; ids: string[]; execute: () => void }
interface DisconnectRequest { owner: ConnectionOwner; blockId: string; name: string; local: boolean }
interface TitlebarGesture { pointerId: number; x: number; y: number }
interface TitlebarClick { at: number; x: number; y: number }
interface WorkspaceTabSlot { id: string; centerX: number }
interface WorkspaceDragGesture { id: string; pointerId: number; x: number; y: number; active: boolean; offsetX: number; targetId: string | null; slots: WorkspaceTabSlot[] }
interface WorkspaceDragVisual { id: string; offsetX: number; targetId: string | null }

const WORKSPACE_DRAG_THRESHOLD_PX = 10;
const TITLEBAR_DRAG_THRESHOLD_PX = 5;
const TITLEBAR_DOUBLE_CLICK_DISTANCE_PX = 5;
const TITLEBAR_DOUBLE_CLICK_MS = 350;

export function WorkspaceShell() {
  const desktopPlatform = currentDesktopPlatform();
  const usesNativeWindowControls = desktopPlatform === "macos";
  const { hydrated, document, activeWorkspace, dispatch, runtimes, fileRuntimes, networkRuntimes, clearTerminalOsc7State, splitTerminalBlock, connectBlock, connectFileBlock, connectNetworkBlock, disconnectBlock, disconnectFileBlock, disconnectNetworkBlock, isConnectionTargetCurrent, connectedCount, closeSessions, blocksForWorkspace, acceptBlockHostKey, rejectBlockHostKey, acceptFileHostKey, rejectFileHostKey, acceptNetworkHostKey, rejectNetworkHostKey, storageNotice, dismissStorageNotice } = useWorkspace();
  const [tool, setTool] = useState<Tool | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null);
  const [disconnectRequest, setDisconnectRequest] = useState<DisconnectRequest | null>(null);
  const [authRequest, setAuthRequest] = useState<{ owner: ConnectionOwner; blockId: string; profile: ConnectionProfile } | null>(null);
  const [vaultUnlockRequest, setVaultUnlockRequest] = useState<{ owner: ConnectionOwner; blockId: string; profile: ConnectionProfile; mode: MasterPasswordMode } | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultLockBusy, setVaultLockBusy] = useState(false);
  const [vaultLockError, setVaultLockError] = useState("");
  const [lockChoiceOpen, setLockChoiceOpen] = useState(false);
  const [terminalLocked, setTerminalLocked] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [remoteShellIntegrationEnabled, setRemoteShellIntegrationEnabled] = useState(false);
  const [terminalSettingsReady, setTerminalSettingsReady] = useState(false);
  const [updateSettings, setUpdateSettings] = useState<UpdateSettings | null>(null);
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null);
  const [windowAlwaysOnTop, setWindowAlwaysOnTop] = useState(false);
  const [windowPinBusy, setWindowPinBusy] = useState(false);
  const [workspaceDragVisual, setWorkspaceDragVisual] = useState<WorkspaceDragVisual | null>(null);
  const [workspaceDropSettling, setWorkspaceDropSettling] = useState(false);
  const [workspaceTabIndicator, setWorkspaceTabIndicator] = useState({ x: 0, width: 0, ready: false });
  const [workspaceTransition, setWorkspaceTransition] = useState<{ workspaceId: string; direction: WorkspaceTransitionDirection | null }>(() => ({ workspaceId: activeWorkspace.id, direction: null }));
  const [localTerminalAttentionWorkspaceId, setLocalTerminalAttentionWorkspaceId] = useState<string | null>(null);
  const workspaceTabStripRef = useRef<HTMLElement | null>(null);
  const workspaceTabRefs = useRef(new Map<string, HTMLDivElement>());
  const previousWorkspaceOrderRef = useRef(document.workspaces.map((workspace) => workspace.id));
  const workspaceTransitionOrderOverrideRef = useRef<string[] | null>(null);
  const workspaceDragRef = useRef<WorkspaceDragGesture | null>(null);
  const workspaceDragCleanupRef = useRef<(() => void) | null>(null);
  const workspaceDragClickSuppressionRef = useRef<string | null>(null);
  const workspaceDragClickTimerRef = useRef<number | null>(null);
  const workspaceDropSettleFrameRef = useRef<number | null>(null);
  const titlebarGestureRef = useRef<TitlebarGesture | null>(null);
  const titlebarGestureCleanupRef = useRef<(() => void) | null>(null);
  const titlebarLastClickRef = useRef<TitlebarClick | null>(null);
  const automaticAttemptsRef = useRef(new Set<string>());
  const vaultStatusRef = useRef<VaultStatus | null>(null);
  const vaultLockBusyRef = useRef(false);
  const terminalLastActivityRef = useRef<number | null>(null);
  const previousTerminalLockedRef = useRef(false);
  const previousRemoteShellIntegrationEnabledRef = useRef<boolean | null>(null);
  const localTerminalAttentionTimerRef = useRef<number | null>(null);
  const startupAttentionShownRef = useRef(false);
  const knownWorkspaceIdsRef = useRef(new Set(document.workspaces.map((workspace) => workspace.id)));
  const terminalHostPrompt = Object.entries(runtimes).find(([, runtime]) => runtime.hostKeyPrompt);
  const fileHostPrompt = Object.entries(fileRuntimes).find(([, runtime]) => runtime.hostKeyPrompt);
  const networkHostPrompt = Object.entries(networkRuntimes).find(([, runtime]) => runtime.hostKeyPrompt);
  const workspaceOrder = document.workspaces.map((workspace) => workspace.id).join("\u0000");
  const hostPrompt = terminalHostPrompt
    ? { owner: "terminal" as const, blockId: terminalHostPrompt[0], prompt: terminalHostPrompt[1].hostKeyPrompt! }
    : fileHostPrompt
      ? { owner: "files" as const, blockId: fileHostPrompt[0], prompt: fileHostPrompt[1].hostKeyPrompt! }
      : networkHostPrompt
        ? { owner: "network" as const, blockId: networkHostPrompt[0], prompt: networkHostPrompt[1].hostKeyPrompt! }
        : null;
  const hostPromptOpen = Boolean(hostPrompt);

  const showLocalTerminalAttention = useCallback((workspaceId: string) => {
    if (localTerminalAttentionTimerRef.current !== null) window.clearTimeout(localTerminalAttentionTimerRef.current);
    localTerminalAttentionTimerRef.current = window.setTimeout(() => {
      setLocalTerminalAttentionWorkspaceId(workspaceId);
      localTerminalAttentionTimerRef.current = window.setTimeout(() => {
        setLocalTerminalAttentionWorkspaceId((current) => current === workspaceId ? null : current);
        localTerminalAttentionTimerRef.current = null;
      }, TERMINAL_ATTENTION_MS);
    }, 0);
  }, []);

  useEffect(() => () => {
    if (localTerminalAttentionTimerRef.current !== null) window.clearTimeout(localTerminalAttentionTimerRef.current);
  }, []);

  useEffect(() => {
    const nextWorkspaceIds = new Set(document.workspaces.map((workspace) => workspace.id));
    if (!hydrated) {
      knownWorkspaceIdsRef.current = nextWorkspaceIds;
      return;
    }
    if (!startupAttentionShownRef.current) {
      startupAttentionShownRef.current = true;
      knownWorkspaceIdsRef.current = nextWorkspaceIds;
      if (hasLocalTerminal(activeWorkspace.layout)) showLocalTerminalAttention(activeWorkspace.id);
      return;
    }
    const addedWorkspace = document.workspaces.find((workspace) => !knownWorkspaceIdsRef.current.has(workspace.id));
    knownWorkspaceIdsRef.current = nextWorkspaceIds;
    if (addedWorkspace && hasLocalTerminal(addedWorkspace.layout)) showLocalTerminalAttention(addedWorkspace.id);
  }, [activeWorkspace, document.workspaces, hydrated, showLocalTerminalAttention]);

  useLayoutEffect(() => {
    const strip = workspaceTabStripRef.current;
    const selectedTab = workspaceTabRefs.current.get(activeWorkspace.id);
    if (!strip || !selectedTab) return;

    const positionIndicator = () => {
      const stripRect = strip.getBoundingClientRect();
      const tabRect = selectedTab.getBoundingClientRect();
      const x = tabRect.left - stripRect.left + strip.scrollLeft;
      setWorkspaceTabIndicator((current) => current.x === x && current.width === tabRect.width && current.ready
        ? current
        : { x, width: tabRect.width, ready: true });
    };

    positionIndicator();
    window.addEventListener("resize", positionIndicator);
    return () => window.removeEventListener("resize", positionIndicator);
  }, [activeWorkspace.id, workspaceOrder]);

  useLayoutEffect(() => {
    const nextOrder = document.workspaces.map((workspace) => workspace.id);
    const transitionOrder = workspaceTransitionOrderOverrideRef.current ?? previousWorkspaceOrderRef.current;
    workspaceTransitionOrderOverrideRef.current = null;
    setWorkspaceTransition((current) => {
      if (current.workspaceId === activeWorkspace.id) return current;
      const previousIndex = transitionOrder.indexOf(current.workspaceId);
      const nextIndexInPreviousOrder = transitionOrder.indexOf(activeWorkspace.id);
      const nextIndex = nextIndexInPreviousOrder >= 0 ? nextIndexInPreviousOrder : nextOrder.indexOf(activeWorkspace.id);
      const direction = previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex
        ? null
        : nextIndex > previousIndex ? "forward" : "backward";
      return { workspaceId: activeWorkspace.id, direction };
    });
    previousWorkspaceOrderRef.current = nextOrder;
  }, [activeWorkspace.id, document.workspaces, workspaceOrder]);

  function requestClose(request: CloseRequest) {
    if (connectedCount(request.ids) === 0) {
      void closeSessions(request.ids).then(request.execute);
    } else {
      setCloseRequest(request);
    }
  }

  function closeBlock(blockId: string) {
    const blockType = activeWorkspace.layout && blockId ? findBlockType(activeWorkspace, blockId) : null;
    const title = blockType === "files" ? "关闭文件窗口？" : blockType === "network" ? "关闭网络窗口？" : "关闭终端？";
    const detail = blockType === "files" ? "活动文件连接会同时断开。" : blockType === "network" ? "活动网络转发和 SSH 连接会同时停止。" : "活动终端会话会同时断开，终端缓冲不会保留。";
    requestClose({ title, detail, ids: [blockId], execute: () => dispatch({ type: "closeBlock", workspaceId: activeWorkspace.id, blockId }) });
  }

  function closeWorkspace(workspace: Workspace) {
    const ids = blocksForWorkspace(workspace);
    requestClose({ title: `关闭 ${workspace.name}？`, detail: "Workspace 内的布局和所有终端会话会同时关闭。", ids, execute: () => dispatch({ type: "closeWorkspace", workspaceId: workspace.id }) });
  }

  function commitRename() {
    if (!renaming) return;
    dispatch({ type: "renameWorkspace", workspaceId: renaming.id, name: renaming.value });
    setRenaming(null);
  }

  function beginWorkspaceDrag(event: ReactPointerEvent<HTMLDivElement>, workspaceId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("input,.workspace-tab-close")) return;
    workspaceDragCleanupRef.current?.();
    const slots = document.workspaces.flatMap((workspace) => {
      const element = workspaceTabRefs.current.get(workspace.id);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ id: workspace.id, centerX: rect.left + rect.width / 2 }];
    });
    const origin: WorkspaceDragGesture = { id: workspaceId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, offsetX: 0, targetId: null, slots };
    workspaceDragRef.current = origin;
    const move = (pointer: PointerEvent) => {
      const state = workspaceDragRef.current;
      if (!state || pointer.pointerId !== state.pointerId) return;
      const offsetX = pointer.clientX - state.x;
      const offsetY = pointer.clientY - state.y;
      if (!state.active) {
        if (Math.abs(offsetY) >= WORKSPACE_DRAG_THRESHOLD_PX && Math.abs(offsetY) >= Math.abs(offsetX)) {
          finish();
          return;
        }
        if (Math.abs(offsetX) < WORKSPACE_DRAG_THRESHOLD_PX || Math.abs(offsetX) <= Math.abs(offsetY)) return;
      }
      pointer.preventDefault();
      const nextTargetId = resolveWorkspaceDropTarget(state.slots, workspaceId, offsetX);
      const nextGesture = { ...state, active: true, offsetX, targetId: nextTargetId };
      workspaceDragRef.current = nextGesture;
      setWorkspaceDragVisual({ id: workspaceId, offsetX, targetId: nextTargetId });
    };
    const finish = () => {
      workspaceDragRef.current = null;
      setWorkspaceDragVisual(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (workspaceDragCleanupRef.current === finish) workspaceDragCleanupRef.current = null;
    };
    const end = (pointer: PointerEvent) => {
      const state = workspaceDragRef.current;
      if (!state || pointer.pointerId !== state.pointerId) return;
      if (state.active) {
        workspaceDragClickSuppressionRef.current = workspaceId;
        if (workspaceDragClickTimerRef.current !== null) window.clearTimeout(workspaceDragClickTimerRef.current);
        workspaceDragClickTimerRef.current = window.setTimeout(() => {
          workspaceDragClickSuppressionRef.current = null;
          workspaceDragClickTimerRef.current = null;
        }, 0);
        if (state.targetId) {
          setWorkspaceDropSettling(true);
          if (workspaceDropSettleFrameRef.current !== null) window.cancelAnimationFrame(workspaceDropSettleFrameRef.current);
          workspaceDropSettleFrameRef.current = window.requestAnimationFrame(() => {
            workspaceDropSettleFrameRef.current = window.requestAnimationFrame(() => {
              workspaceDropSettleFrameRef.current = null;
              setWorkspaceDropSettling(false);
            });
          });
          if (activeWorkspace.id !== workspaceId) {
            workspaceTransitionOrderOverrideRef.current = moveWorkspaceInOrder(state.slots.map((slot) => slot.id), workspaceId, state.targetId);
          }
          dispatch({ type: "reorderWorkspace", workspaceId, targetWorkspaceId: state.targetId });
          if (activeWorkspace.id !== workspaceId) dispatch({ type: "selectWorkspace", workspaceId });
        }
      }
      finish();
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId === workspaceDragRef.current?.pointerId) finish();
    };
    workspaceDragCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }

  function beginWindowDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if (isInteractiveTitlebarTarget(event.target)) {
      titlebarGestureCleanupRef.current?.();
      titlebarLastClickRef.current = null;
      return;
    }

    titlebarGestureCleanupRef.current?.();
    const now = Date.now();
    const lastClick = titlebarLastClickRef.current;
    const isDoubleClick = lastClick
      && now - lastClick.at <= TITLEBAR_DOUBLE_CLICK_MS
      && Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) <= TITLEBAR_DOUBLE_CLICK_DISTANCE_PX;
    if (isDoubleClick) {
      event.preventDefault();
      titlebarLastClickRef.current = null;
      void toggleMaximizeCurrentWindow();
      return;
    }
    if (lastClick && now - lastClick.at > TITLEBAR_DOUBLE_CLICK_MS) titlebarLastClickRef.current = null;

    titlebarGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const finish = () => {
      titlebarGestureRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (titlebarGestureCleanupRef.current === finish) titlebarGestureCleanupRef.current = null;
    };
    const move = (pointer: PointerEvent) => {
      const gesture = titlebarGestureRef.current;
      if (!gesture || pointer.pointerId !== gesture.pointerId) return;
      if (Math.hypot(pointer.clientX - gesture.x, pointer.clientY - gesture.y) < TITLEBAR_DRAG_THRESHOLD_PX) return;
      titlebarLastClickRef.current = null;
      finish();
      void startDraggingCurrentWindow();
    };
    const end = (pointer: PointerEvent) => {
      const gesture = titlebarGestureRef.current;
      if (!gesture || pointer.pointerId !== gesture.pointerId) return;
      finish();
      titlebarLastClickRef.current = { at: Date.now(), x: pointer.clientX, y: pointer.clientY };
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== titlebarGestureRef.current?.pointerId) return;
      finish();
      titlebarLastClickRef.current = null;
    };
    titlebarGestureCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }

  function suppressWorkspaceDragClick(event: ReactMouseEvent<HTMLButtonElement>, workspaceId: string): boolean {
    if (workspaceDragClickSuppressionRef.current !== workspaceId) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  async function toggleWindowAlwaysOnTop() {
    if (windowPinBusy) return;
    const next = !windowAlwaysOnTop;
    setWindowPinBusy(true);
    try {
      await setCurrentWindowAlwaysOnTop(next);
      setWindowAlwaysOnTop(next);
    } catch {
      // Keep the visible state aligned with the last confirmed native state.
    } finally {
      setWindowPinBusy(false);
    }
  }

  const commitVaultStatus = useCallback((status: VaultStatus) => {
    vaultStatusRef.current = status;
    setVaultStatus(status);
  }, []);

  const applyLockScope = useCallback(async (scope: "vault" | "terminalAndVault") => {
    const currentStatus = vaultStatusRef.current;
    if (!currentStatus?.initialized || currentStatus.legacy || vaultLockBusyRef.current || (scope === "vault" && !currentStatus.unlocked)) return false;
    vaultLockBusyRef.current = true;
    setVaultLockBusy(true);
    setVaultLockError("");
    try {
      if (currentStatus.unlocked) await lockVault();
      const lockedStatus = { initialized: true, unlocked: false, legacy: false };
      commitVaultStatus(lockedStatus);
      setLockChoiceOpen(false);
      if (scope === "terminalAndVault") {
        setTool(null);
        setTerminalLocked(true);
      }
      return true;
    } catch (error) {
      setVaultLockError(errorMessage(error));
      return false;
    } finally {
      vaultLockBusyRef.current = false;
      setVaultLockBusy(false);
    }
  }, [commitVaultStatus]);

  useEffect(() => () => {
    workspaceDragCleanupRef.current?.();
    titlebarGestureCleanupRef.current?.();
    if (workspaceDragClickTimerRef.current !== null) window.clearTimeout(workspaceDragClickTimerRef.current);
    if (workspaceDropSettleFrameRef.current !== null) window.cancelAnimationFrame(workspaceDropSettleFrameRef.current);
  }, []);

  useEffect(() => {
    let disposed = false;
    void isCurrentWindowAlwaysOnTop().then((value) => {
      if (!disposed) setWindowAlwaysOnTop(value);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    let disposed = false;
    void getSettings().then(async (snapshot) => {
      if (disposed) return;
      setSecuritySettings(snapshot.security);
      setRemoteShellIntegrationEnabled(snapshot.terminal?.remoteShellIntegrationEnabled ?? false);
      setTerminalSettingsReady(true);
      setUpdateSettings(snapshot.updates);
      if (!snapshot.updates.autoCheckOnStartup) return;
      const result = await checkForUpdateOnStartupOnce();
      if (!disposed && result?.status === "available") {
        setAvailableUpdateVersion(result.latestVersion);
      }
    }).catch(() => {
      if (!disposed) setTerminalSettingsReady(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!terminalSettingsReady) return;
    const previous = previousRemoteShellIntegrationEnabledRef.current;
    previousRemoteShellIntegrationEnabledRef.current = remoteShellIntegrationEnabled;
    if (previous === true && !remoteShellIntegrationEnabled) clearTerminalOsc7State();
  }, [clearTerminalOsc7State, remoteShellIntegrationEnabled, terminalSettingsReady]);

  useEffect(() => {
    if (!availableUpdateVersion) return;
    const timer = window.setTimeout(() => setAvailableUpdateVersion(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [availableUpdateVersion]);

  async function changeAutoUpdateCheck(enabled: boolean) {
    const snapshot = await updateUpdateSettings({ autoCheckOnStartup: enabled });
    setUpdateSettings(snapshot.updates);
  }

  useEffect(() => {
    let disposed = false;
    let statusEventReceived = false;
    let unlisten: (() => void) | undefined;
    void onVaultStatusChanged((event) => {
      if (disposed) return;
      statusEventReceived = true;
      const current = vaultStatusRef.current;
      commitVaultStatus({ initialized: current?.initialized ?? true, unlocked: event.unlocked, legacy: current?.legacy ?? false });
      setVaultLockError("");
    }).then((value) => { if (disposed) value(); else unlisten = value; }).catch(() => undefined);
    void getVaultStatus().then((status) => {
      if (!disposed && !statusEventReceived) {
        commitVaultStatus(status);
      }
    }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [commitVaultStatus]);

  useEffect(() => {
    terminalLastActivityRef.current = Date.now();
  }, [securitySettings?.terminalAutoLockAfterSeconds]);

  useEffect(() => {
    if (previousTerminalLockedRef.current && !terminalLocked) terminalLastActivityRef.current = Date.now();
    previousTerminalLockedRef.current = terminalLocked;
  }, [terminalLocked]);

  useEffect(() => {
    const seconds = securitySettings?.terminalAutoLockAfterSeconds;
    if (seconds === null || seconds === undefined || terminalLocked || !vaultStatus?.initialized || vaultStatus.legacy) return;
    let timer: number | undefined;
    let locking = false;
    const attemptLock = () => {
      if (locking) return;
      locking = true;
      void applyLockScope("terminalAndVault").finally(() => { locking = false; });
    };
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const lastActivity = terminalLastActivityRef.current ?? Date.now();
      const remaining = Math.max(0, lastActivity + seconds * 1000 - Date.now());
      timer = window.setTimeout(attemptLock, remaining);
    };
    const recordActivity = () => {
      if (locking) return;
      terminalLastActivityRef.current = Date.now();
      schedule();
    };
    const checkDeadline = () => {
      const lastActivity = terminalLastActivityRef.current ?? Date.now();
      if (Date.now() >= lastActivity + seconds * 1000) {
        if (timer !== undefined) window.clearTimeout(timer);
        attemptLock();
      } else {
        schedule();
      }
    };
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("pointerdown", recordActivity);
    window.addEventListener("wheel", recordActivity, { passive: true });
    window.addEventListener("focus", checkDeadline);
    globalThis.document.addEventListener("visibilitychange", checkDeadline);
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("wheel", recordActivity);
      window.removeEventListener("focus", checkDeadline);
      globalThis.document.removeEventListener("visibilitychange", checkDeadline);
    };
  }, [applyLockScope, securitySettings?.terminalAutoLockAfterSeconds, terminalLocked, vaultStatus?.initialized, vaultStatus?.legacy]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableOutsideTerminal(event.target)) return;
      const command = resolveAppShortcut(event, desktopPlatform);
      if (!command) return;
      const modalOpen = Boolean(tool || authRequest || vaultUnlockRequest || lockChoiceOpen || closeRequest || disconnectRequest || hostPromptOpen);
      if (modalOpen) return;
      const allowedWhileLocked = command.type === "newWorkspace" || command.type === "selectWorkspace" || command.type === "cycleWorkspace";
      if (terminalLocked && !allowedWhileLocked) return;

      let handled = true;
      if (command.type === "newWorkspace") dispatch({ type: "addWorkspace" });
      else if (command.type === "openConnections") setTool("connections");
      else if (command.type === "splitBlock") splitTerminalBlock(activeWorkspace.id, activeWorkspace.activeBlockId, command.direction, remoteShellIntegrationEnabled);
      else if (command.type === "focusBlock") {
        const blockId = adjacentBlockId(activeWorkspace.layout, activeWorkspace.activeBlockId, command.direction);
        if (blockId) dispatch({ type: "selectBlock", workspaceId: activeWorkspace.id, blockId });
        else handled = false;
      }
      else if (command.type === "cycleBlock") {
        const ids = blockIds(activeWorkspace.layout);
        const index = ids.indexOf(activeWorkspace.activeBlockId);
        const blockId = ids[(index + command.offset + ids.length) % ids.length];
        if (blockId && blockId !== activeWorkspace.activeBlockId) dispatch({ type: "selectBlock", workspaceId: activeWorkspace.id, blockId });
        else handled = false;
      }
      else if (command.type === "searchTerminal") handled = openTerminalSearch(activeWorkspace.activeBlockId);
      else if (command.type === "selectWorkspace") {
        const workspace = document.workspaces[command.index];
        if (workspace) dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
        else handled = false;
      } else {
        const index = document.workspaces.findIndex((workspace) => workspace.id === activeWorkspace.id);
        const workspace = document.workspaces[(index + command.offset + document.workspaces.length) % document.workspaces.length];
        dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeWorkspace.activeBlockId, activeWorkspace.id, activeWorkspace.layout, authRequest, closeRequest, desktopPlatform, disconnectRequest, dispatch, document.workspaces, hostPromptOpen, lockChoiceOpen, remoteShellIntegrationEnabled, splitTerminalBlock, terminalLocked, tool, vaultUnlockRequest]);

  useEffect(() => {
    if (terminalLocked) return;
    const activeElement = globalThis.document.activeElement;
    const focusedBlockId = activeElement instanceof Element
      ? activeElement.closest<HTMLElement>("[data-layout-block]")?.dataset.layoutBlock
      : undefined;
    if (focusedBlockId === activeWorkspace.activeBlockId) return;
    if (activeElement instanceof Element && activeElement.closest(".workspace-tab")) {
      const timer = window.setTimeout(() => {
        if (!isEditableOutsideTerminal(globalThis.document.activeElement)) focusWorkspaceBlock(activeWorkspace.activeBlockId);
      }, TITLEBAR_DOUBLE_CLICK_MS + 30);
      return () => window.clearTimeout(timer);
    }
    const frame = window.requestAnimationFrame(() => focusWorkspaceBlock(activeWorkspace.activeBlockId));
    return () => window.cancelAnimationFrame(frame);
  }, [activeWorkspace.activeBlockId, activeWorkspace.id, terminalLocked]);

  async function confirmClose() {
    if (!closeRequest) return;
    await closeSessions(closeRequest.ids);
    closeRequest.execute();
    setCloseRequest(null);
  }

  async function confirmDisconnect() {
    if (!disconnectRequest) return;
    if (disconnectRequest.owner === "files") await disconnectFileBlock(disconnectRequest.blockId);
    else if (disconnectRequest.owner === "network") await disconnectNetworkBlock(disconnectRequest.blockId);
    else await disconnectBlock(disconnectRequest.blockId);
    setDisconnectRequest(null);
  }

  async function requestConfiguredConnection(owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) {
    const targetCurrent = () => isConnectionTargetCurrent(owner, blockId, profile.id);
    if (!targetCurrent()) return;
    const key = `${owner}:${blockId}:${profile.id}`;
    if (automaticAttemptsRef.current.has(key)) return;
    automaticAttemptsRef.current.add(key);
    const showAuthentication = () => {
      automaticAttemptsRef.current.delete(key);
      if (!targetCurrent()) return;
      setAuthRequest({ owner, blockId, profile });
    };
    try {
      const routeRequirements = await getProfileRouteRequirements(profile.id);
      if (routeRequirements.usesCredential) {
        const status = await getVaultStatus();
        if (!targetCurrent()) return;
        if (!status.unlocked) {
          if (status.legacy) {
            showAuthentication();
            return;
          }
          automaticAttemptsRef.current.delete(key);
          setVaultUnlockRequest({ owner, blockId, profile, mode: status.initialized ? "unlock" : "initialize" });
          return;
        }
      }
      const auth = await resolveConfiguredAuth(profile);
      if (!targetCurrent()) return;
      if (!auth) { showAuthentication(); return; }
      if (owner === "terminal") await connectBlock(blockId, profile, auth, showAuthentication);
      else if (owner === "files") await connectFileBlock(blockId, profile, auth, showAuthentication);
      else await connectNetworkBlock(blockId, profile, auth, showAuthentication);
    } catch {
      if (targetCurrent()) showAuthentication();
    } finally {
      automaticAttemptsRef.current.delete(key);
    }
  }

  function closeVaultAwareTool() {
    setTool(null);
    void getVaultStatus().then(commitVaultStatus).catch(() => undefined);
  }

  const terminalLockLabel = vaultLockBusy
    ? "正在锁定终端"
    : !vaultStatus
      ? "正在读取凭证库状态"
      : vaultStatus.legacy
        ? "请先清除旧版凭证库"
        : !vaultStatus.initialized
          ? "请先初始化凭证库"
        : "锁定终端";
  const draggedWorkspaceIndex = workspaceDragVisual
    ? document.workspaces.findIndex((workspace) => workspace.id === workspaceDragVisual.id)
    : -1;
  const dropTargetWorkspaceIndex = workspaceDragVisual?.targetId
    ? document.workspaces.findIndex((workspace) => workspace.id === workspaceDragVisual.targetId)
    : -1;

  return <main className="app-shell" data-platform={desktopPlatform}>
    <header className="app-chrome" onPointerDown={beginWindowDrag}>
      <div className="app-brand" aria-label="Qterm">
        <Icon name="terminal" size={15}/><span>Qterm</span>
      </div>
      <nav ref={workspaceTabStripRef} className={`workspace-tab-strip${workspaceDragVisual ? " dragging" : ""}${workspaceDropSettling ? " drop-settling" : ""}`} aria-label="工作区">
        <span
          aria-hidden="true"
          className={`workspace-tab-selection${workspaceTabIndicator.ready ? " ready" : ""}`}
          style={{ width: workspaceTabIndicator.width, transform: `translate3d(${workspaceTabIndicator.x}px, 0, 0)` }}
        />
        {document.workspaces.map((workspace, workspaceIndex) => {
          const isDragged = workspaceDragVisual?.id === workspace.id;
          const isDropTarget = workspaceDragVisual?.targetId === workspace.id;
          const dropShift = draggedWorkspaceIndex >= 0 && dropTargetWorkspaceIndex > draggedWorkspaceIndex
            && workspaceIndex > draggedWorkspaceIndex && workspaceIndex <= dropTargetWorkspaceIndex
            ? "left"
            : draggedWorkspaceIndex >= 0 && dropTargetWorkspaceIndex >= 0 && dropTargetWorkspaceIndex < draggedWorkspaceIndex
              && workspaceIndex >= dropTargetWorkspaceIndex && workspaceIndex < draggedWorkspaceIndex
              ? "right"
              : undefined;
          const dragStyle = isDragged ? { "--workspace-tab-drag-x": `${workspaceDragVisual.offsetX}px` } as CSSProperties : undefined;
          return <div ref={(element) => { if (element) workspaceTabRefs.current.set(workspace.id, element); else workspaceTabRefs.current.delete(workspace.id); }} key={workspace.id} data-workspace-id={workspace.id} data-drop-shift={dropShift} style={dragStyle} className={`workspace-tab${workspace.id === activeWorkspace.id ? " selected" : ""}${isDragged ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`} onPointerDown={(event) => beginWorkspaceDrag(event, workspace.id)}>
          {renaming?.id === workspace.id ? <div className="workspace-tab-rename"><Icon name="workspace" size={13}/><input autoFocus aria-label={`重命名 ${workspace.name}`} value={renaming.value} onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") setRenaming(null); }}/></div>
            : <button className="workspace-tab-select" onClick={(event) => { if (!suppressWorkspaceDragClick(event, workspace.id)) dispatch({ type: "selectWorkspace", workspaceId: workspace.id }); }} onDoubleClick={(event) => { if (!suppressWorkspaceDragClick(event, workspace.id)) setRenaming({ id: workspace.id, value: workspace.name }); }}><Icon name="workspace" size={13}/><span>{workspace.name}</span></button>}
          {document.workspaces.length > 1 && <IconButton className="workspace-tab-close" size="compact" label={`关闭 ${workspace.name}`} onClick={() => closeWorkspace(workspace)}><Icon name="close" size={12}/></IconButton>}
        </div>})}
        <IconButton className="new-workspace-tab" size="compact" label="新建工作区" title={`新建 Workspace (${shortcutLabel("newWorkspace", desktopPlatform)})`} onClick={() => dispatch({ type: "addWorkspace" })}><Icon name="plus" size={14}/></IconButton>
      </nav>
      <div className="window-controls" aria-label="窗口控制">
        <button className="window-pin" aria-label={windowAlwaysOnTop ? "取消窗口置顶" : "置顶窗口"} aria-pressed={windowAlwaysOnTop} aria-busy={windowPinBusy || undefined} title={windowAlwaysOnTop ? "取消置顶" : "置顶窗口"} disabled={windowPinBusy} onClick={() => void toggleWindowAlwaysOnTop()}><Icon name="pin" size={14}/></button>
        {!usesNativeWindowControls && <>
          <button aria-label="最小化窗口" title="最小化" onClick={() => void minimizeCurrentWindow()}><Icon name="windowMinimize" size={14}/></button>
          <button aria-label="最大化或还原窗口" title="最大化或还原" onClick={() => void toggleMaximizeCurrentWindow()}><Icon name="windowMaximize" size={12}/></button>
          <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void closeCurrentWindow()}><Icon name="close" size={14}/></button>
        </>}
      </div>
    </header>

    <section className="workspace-stage">
      <div className="workspace-stage-content" inert={terminalLocked ? true : undefined} aria-hidden={terminalLocked || undefined}>
        <div className="workspace-canvases">
          {document.workspaces.map((workspace) => {
            const visible = workspace.id === activeWorkspace.id;
            const transitionDirection = visible && workspaceTransition.workspaceId === workspace.id ? workspaceTransition.direction : null;
            return <div key={workspace.id} className={`workspace-canvas-stage${visible ? " visible" : ""}${transitionDirection ? ` workspace-transition-${transitionDirection}` : ""}`} aria-hidden={!visible}><WorkspaceCanvas workspace={workspace} visible={visible} localTerminalAttention={localTerminalAttentionWorkspaceId === workspace.id} remoteShellIntegrationEnabled={remoteShellIntegrationEnabled} terminalSettingsReady={terminalSettingsReady} onRequestClose={closeBlock} onRequestDisconnect={(owner, blockId, name, local) => setDisconnectRequest({ owner, blockId, name, local })} onRequestAuthConnection={(owner, blockId, profile) => void requestConfiguredConnection(owner, blockId, profile)} onOpenConnectionManager={() => setTool("connections")}/></div>;
          })}
        </div>
        <aside className="utility-rail" aria-label="工具">
          <RailButton tool="connections" icon="connections" label="链接管理" active={tool === "connections"} onClick={setTool}/>
          <RailButton tool="credentials" icon="key" label="凭证管理" active={tool === "credentials"} onClick={setTool}/>
          <RailActionButton icon="files" label="文件管理" onClick={() => dispatch(openFileWindowAction(activeWorkspace))}/>
          <RailActionButton icon="network" label="网络管理" onClick={() => dispatch(openNetworkWindowAction(activeWorkspace))}/>
          <RailActionButton icon="terminal" label="打开终端" onClick={() => splitTerminalBlock(activeWorkspace.id, activeWorkspace.activeBlockId, "horizontal", remoteShellIntegrationEnabled)}/>
          <span className="rail-spacer"/>
          <RailActionButton icon="lock" label="锁定终端" accessibleLabel={terminalLockLabel} title={terminalLockLabel} disabled={!vaultStatus?.initialized || vaultStatus.legacy || vaultLockBusy} onClick={() => { setVaultLockError(""); setLockChoiceOpen(true); }}/>
          <RailButton tool="settings" icon="settings" label="系统设置" active={tool === "settings"} onClick={setTool}/>
          <RailButton
            tool="help"
            icon="help"
            label="关于"
            active={tool === "help"}
            notice={availableUpdateVersion ? `发现新版本 v${availableUpdateVersion}` : undefined}
            onClick={(next) => { setAvailableUpdateVersion(null); setTool(next); }}
          />
        </aside>
      </div>
      {terminalLocked && (
        <TerminalLockScreen onUnlocked={() => {
          commitVaultStatus({ initialized: true, unlocked: true, legacy: false });
          setTerminalLocked(false);
        }}/>
      )}
    </section>

    {tool === "connections" && <ConnectionDialog onClose={closeVaultAwareTool}/>}
    {tool === "credentials" && <CredentialDialog onClose={closeVaultAwareTool}/>}
    {authRequest && (
      <ConnectionAuthDialog profile={authRequest.profile} onClose={() => setAuthRequest(null)} onConnect={async (auth) => {
        const request = authRequest;
        if (!isConnectionTargetCurrent(request.owner, request.blockId, request.profile.id)) return;
        if (request.owner === "terminal") await connectBlock(request.blockId, request.profile, auth);
        else if (request.owner === "files") await connectFileBlock(request.blockId, request.profile, auth);
        else await connectNetworkBlock(request.blockId, request.profile, auth);
      }}/>
    )}
    {vaultUnlockRequest && <MasterPasswordDialog mode={vaultUnlockRequest.mode} onClose={() => setVaultUnlockRequest(null)} onSuccess={() => {
      const request = vaultUnlockRequest;
      commitVaultStatus({ initialized: true, unlocked: true, legacy: false });
      setVaultUnlockRequest(null);
      void requestConfiguredConnection(request.owner, request.blockId, request.profile);
    }}/>}
    {tool === "settings" && <SettingsDialog onClose={() => setTool(null)} onSecuritySettingsChanged={setSecuritySettings} onTerminalSettingsChanged={(settings: TerminalSettings) => setRemoteShellIntegrationEnabled(settings.remoteShellIntegrationEnabled)}/>}
    {tool === "help" && <HelpDialog
      onClose={() => setTool(null)}
      autoCheckOnStartup={updateSettings?.autoCheckOnStartup ?? false}
      onAutoCheckOnStartupChange={updateSettings ? changeAutoUpdateCheck : undefined}
    />}
    {lockChoiceOpen && <TerminalLockChoiceDialog vaultUnlocked={Boolean(vaultStatus?.unlocked)} busy={vaultLockBusy} message={vaultLockError} onClose={() => { setLockChoiceOpen(false); setVaultLockError(""); }} onLockVault={() => void applyLockScope("vault")} onLockTerminalAndVault={() => void applyLockScope("terminalAndVault")}/>}
    {closeRequest && <DialogFrame title={closeRequest.title} subtitle="未保存的终端输出无法恢复" onClose={() => setCloseRequest(null)}><p className="confirm-copy">{closeRequest.detail}</p><p className="callout">将断开 {connectedCount(closeRequest.ids)} 个活动会话。</p><footer className="dialog-actions end"><button className="secondary-button" onClick={() => setCloseRequest(null)}>取消</button><button className="danger-button filled" onClick={() => void confirmClose()}>关闭并断开</button></footer></DialogFrame>}
    {disconnectRequest && <DialogFrame compact title={disconnectRequest.local ? "停止本地终端？" : `断开“${disconnectRequest.name}”？`} subtitle={disconnectRequest.owner === "files" ? "文件窗口和当前路径将保留" : disconnectRequest.owner === "network" ? "网络窗口和规则配置将保留" : "终端 Block 和当前输出将保留"} onClose={() => setDisconnectRequest(null)}><p className="confirm-copy">{disconnectRequest.local ? "正在运行的本地 Shell 和前台进程将停止。" : disconnectRequest.owner === "files" ? "当前 SFTP 会话将结束，之后可以从状态旁重新连接。" : disconnectRequest.owner === "network" ? "当前 SSH 会话及运行中的网络规则将结束，之后可以从状态旁重新连接。" : "当前 SSH 会话和其中运行的前台进程将结束，之后可以从状态旁重新连接。"}</p><footer className="dialog-actions end"><button className="secondary-button" onClick={() => setDisconnectRequest(null)}>取消</button><button className="danger-button filled" onClick={() => void confirmDisconnect()}>{disconnectRequest.local ? "停止终端" : "断开连接"}</button></footer></DialogFrame>}
    {hostPrompt && <DialogFrame title="确认主机身份" subtitle={`${hostPrompt.prompt.node.role === "jump" ? "跳板" : "目标"}“${hostPrompt.prompt.node.name}” · ${hostPrompt.prompt.node.host}:${hostPrompt.prompt.node.port}`} onClose={() => void rejectPromptHostKey(hostPrompt.owner, hostPrompt.blockId)}><p className="confirm-copy">请通过可信渠道核对当前节点的主机密钥指纹：</p><code className="fingerprint">{hostPrompt.prompt.algorithm}<br/>{hostPrompt.prompt.fingerprint}</code><footer className="dialog-actions end"><button className="danger-button" onClick={() => void rejectPromptHostKey(hostPrompt.owner, hostPrompt.blockId)}>拒绝</button><button className="primary-button" onClick={() => void acceptPromptHostKey(hostPrompt.owner, hostPrompt.blockId)}>信任并继续</button></footer></DialogFrame>}
    {storageNotice && <div className="global-notice" role="status"><span>{storageNotice}</span><button aria-label="关闭提示" onClick={dismissStorageNotice}><Icon name="close" size={13}/></button></div>}
  </main>;

  function acceptPromptHostKey(owner: ConnectionOwner, blockId: string) {
    return owner === "terminal" ? acceptBlockHostKey(blockId) : owner === "files" ? acceptFileHostKey(blockId) : acceptNetworkHostKey(blockId);
  }

  function rejectPromptHostKey(owner: ConnectionOwner, blockId: string) {
    return owner === "terminal" ? rejectBlockHostKey(blockId) : owner === "files" ? rejectFileHostKey(blockId) : rejectNetworkHostKey(blockId);
  }
}

function isInteractiveTitlebarTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("button,input,[data-workspace-id]"));
}

function resolveWorkspaceDropTarget(slots: WorkspaceTabSlot[], workspaceId: string, offsetX: number): string | null {
  const draggedSlot = slots.find((slot) => slot.id === workspaceId);
  if (!draggedSlot) return null;
  const projectedCenter = draggedSlot.centerX + offsetX;
  const nearestSlot = slots.reduce((nearest, slot) => Math.abs(slot.centerX - projectedCenter) < Math.abs(nearest.centerX - projectedCenter) ? slot : nearest, draggedSlot);
  return nearestSlot.id === workspaceId ? null : nearestSlot.id;
}

function moveWorkspaceInOrder(order: string[], workspaceId: string, targetWorkspaceId: string): string[] {
  const from = order.indexOf(workspaceId);
  const to = order.indexOf(targetWorkspaceId);
  if (from < 0 || to < 0 || from === to) return order;
  const nextOrder = [...order];
  const [workspace] = nextOrder.splice(from, 1);
  nextOrder.splice(to, 0, workspace);
  return nextOrder;
}

function RailButton({ tool, icon, label, active, notice, onClick }: { tool: Tool; icon: IconName; label: string; active: boolean; notice?: string; onClick: (tool: Tool | null) => void }) {
  return <button className={`rail-button${active ? " active" : ""}${notice ? " update-attention" : ""}`} aria-label={notice ? `${label}，${notice}` : label} title={notice} aria-pressed={active} onClick={() => onClick(active ? null : tool)}><Icon name={icon}/><span className="rail-button-label">{label}</span></button>;
}

function RailActionButton({ icon, label, accessibleLabel = label, title, disabled = false, onClick }: { icon: IconName; label: string; accessibleLabel?: string; title?: string; disabled?: boolean; onClick: () => void }) {
  return <button className="rail-button" aria-label={accessibleLabel} title={title} disabled={disabled} onClick={onClick}><Icon name={icon}/><span className="rail-button-label">{label}</span></button>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isEditableOutsideTerminal(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".terminal-surface")) return false;
  return Boolean(target.closest("input,textarea,select,[contenteditable=true]"));
}

function focusWorkspaceBlock(blockId: string): boolean {
  if (focusTerminalBlock(blockId)) return true;
  const block = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-layout-block]"))
    .find((element) => element.dataset.layoutBlock === blockId);
  block?.focus();
  return Boolean(block);
}

function findBlockType(workspace: Workspace, blockId: string): "terminal" | "files" | "network" | null {
  const visit = (node: Workspace["layout"]): "terminal" | "files" | "network" | null => node.type === "split"
    ? visit(node.first) ?? visit(node.second)
    : node.blockId === blockId ? node.type : null;
  return visit(workspace.layout);
}

function hasLocalTerminal(node: LayoutNode): boolean {
  if (node.type === "split") return hasLocalTerminal(node.first) || hasLocalTerminal(node.second);
  return node.type === "terminal" && node.profileId === null;
}
