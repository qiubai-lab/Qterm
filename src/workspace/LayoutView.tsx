import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../components/Icon";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import { ConnectionRouteProgress } from "../components/ConnectionRouteProgress";
import { ExactTextInput } from "../components/ExactTextInput";
import { FileBrowserPane } from "../files/FileBrowserPane";
import { GitPane } from "../git/GitPane";
import { GitRepositoryHistoryList, GitRepositoryHistoryPopover } from "../git/GitRepositoryHistoryPopover";
import { GitRepositoryPickerDialog } from "../git/GitRepositoryPickerDialog";
import { selectGitRepositoryDirectory } from "../lib/tauri/git";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { NetworkPane } from "../network/NetworkPane";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { OSC7_REPORT_GRACE_MS, TERMINAL_ATTENTION_MS } from "../terminal/terminalAttention";
import { openTerminalSearch } from "../terminal/terminalViewRegistry";
import { terminalBlockIds, type DropPosition } from "./layout";
import { calculateLayoutGeometry, layoutScalarCss, resolveLayoutBounds, type LayoutBounds, type LayoutDividerGeometry } from "./layoutGeometry";
import { isSameGitRepository, recentGitRepositoriesForScope } from "./gitRepositoryHistory";
import { isAbsoluteLocalPath, isValidRemotePath } from "./gitWindow";
import type { GitRepositoryHistoryEntry, GitTarget, LayoutLeaf, Workspace } from "./model";
import { TerminalTargetPicker } from "./TerminalTargetPicker";
import { useWorkspace, type FileRuntime } from "./WorkspaceProvider";

export type ConnectionOwner = "terminal" | "files" | "network" | "git";

interface DragState {
  sourceId: string;
  targetId: string | null;
  position: DropPosition | null;
  x: number;
  y: number;
}

function BlockNotice({ message }: { message: string }) {
  return <div className="block-notice" role="alert" aria-live="assertive" aria-atomic="true">{message}</div>;
}

interface TerminalHeaderAction {
  label: string;
  title?: string;
  icon: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

interface HeaderMenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

function fitHeaderMenu(anchor: DOMRect, width: number, height: number): HeaderMenuPosition {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

function TerminalHeaderActions({ actions, closeDisabled, onClose }: { actions: TerminalHeaderAction[]; closeDisabled: boolean; onClose: () => void }) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<HeaderMenuPosition | null>(null);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuPosition(null);
    if (restoreFocus) window.setTimeout(() => moreButtonRef.current?.focus(), 0);
  }, []);

  function openMenu() {
    const anchor = moreButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setMenuPosition(fitHeaderMenu(anchor, 184, 170));
  }

  useLayoutEffect(() => {
    if (!menuPosition || !menuRef.current || !moreButtonRef.current) return;
    const next = fitHeaderMenu(
      moreButtonRef.current.getBoundingClientRect(),
      menuRef.current.offsetWidth,
      menuRef.current.offsetHeight,
    );
    if (next.left !== menuPosition.left || next.top !== menuPosition.top || next.placement !== menuPosition.placement) setMenuPosition(next);
  }, [menuPosition]);

  useEffect(() => {
    if (!menuPosition) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".terminal-header-menu")) closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const closeWithoutFocus = () => closeMenu(false);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
    };
  }, [closeMenu, menuPosition]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(index + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  function runAction(action: TerminalHeaderAction) {
    closeMenu(false);
    action.onSelect();
  }

  return <>
    <div className="block-actions terminal-header-actions">
      <div className="terminal-header-secondary-actions">
        {actions.map((action) => <button key={action.label} type="button" aria-label={action.label} title={action.title ?? action.label} disabled={action.disabled} onClick={action.onSelect}><Icon name={action.icon} size={13}/></button>)}
      </div>
      <button
        ref={moreButtonRef}
        type="button"
        className="terminal-header-more"
        aria-label="更多终端操作"
        title="更多终端操作"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPosition)}
        onClick={() => menuPosition ? closeMenu() : openMenu()}
      ><Icon name="more" size={13}/></button>
      <button type="button" className="terminal-header-close" aria-label="关闭终端" title="关闭" disabled={closeDisabled} onClick={onClose}><Icon name="close" size={13}/></button>
    </div>
    {menuPosition && createPortal(<div
      ref={menuRef}
      className="terminal-header-menu"
      data-placement={menuPosition.placement}
      role="menu"
      aria-label="终端更多操作"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={() => runAction(action)}><Icon name={action.icon} size={13}/><span>{action.label}</span></button>)}
    </div>, document.body)}
  </>;
}

export function WorkspaceCanvas({ workspace, visible, localTerminalAttention = false, remoteShellIntegrationEnabled = false, terminalSettingsReady = true, onRequestClose, onRequestDisconnect, onRequestAuthConnection, onOpenConnectionManager }: { workspace: Workspace; visible: boolean; localTerminalAttention?: boolean; remoteShellIntegrationEnabled?: boolean; terminalSettingsReady?: boolean; onRequestClose: (blockId: string) => void; onRequestDisconnect?: (owner: ConnectionOwner, blockId: string, name: string, local: boolean) => void; onRequestAuthConnection: (owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => void; onOpenConnectionManager?: () => void }) {
  const { dispatch } = useWorkspace();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [liveRatios, setLiveRatios] = useState<Record<string, number>>({});
  const dragRef = useRef<DragState | null>(null);
  const layoutSurfaceRef = useRef<HTMLDivElement>(null);
  const geometry = calculateLayoutGeometry(workspace.layout, liveRatios);
  const activeBounds = geometry.leaves.find(({ node }) => node.blockId === workspace.activeBlockId)?.bounds ?? null;

  function beginDrag(event: ReactPointerEvent<HTMLElement>, blockId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const element = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
    let committed = false;
    const move = (pointer: PointerEvent) => {
      if (!committed && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < 10) return;
      committed = true;
      const targetElement = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-layout-block]");
      const targetId = targetElement?.dataset.layoutBlock ?? null;
      const position = targetElement && targetId !== blockId ? dropPosition(targetElement.getBoundingClientRect(), pointer.clientX, pointer.clientY) : null;
      const next = { sourceId: blockId, targetId, position, x: pointer.clientX, y: pointer.clientY };
      dragRef.current = next;
      setDrag(next);
    };
    const end = () => {
      const current = dragRef.current;
      if (current?.targetId && current.position) {
        dispatch({ type: "moveBlock", workspaceId: workspace.id, sourceId: blockId, targetId: current.targetId, position: current.position });
      }
      dragRef.current = null;
      setDrag(null);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>, divider: LayoutDividerGeometry) {
    event.preventDefault();
    const element = event.currentTarget;
    const surface = layoutSurfaceRef.current;
    if (!surface) return;
    element.setPointerCapture(event.pointerId);
    let current = divider.ratio;
    const move = (pointer: PointerEvent) => {
      const surfaceRect = surface.getBoundingClientRect();
      const container = resolveLayoutBounds(divider.containerBounds, surfaceRect.width, surfaceRect.height);
      const span = divider.direction === "horizontal" ? container.width : container.height;
      if (span <= 0) return;
      const offset = divider.direction === "horizontal"
        ? pointer.clientX - surfaceRect.left - container.x
        : pointer.clientY - surfaceRect.top - container.y;
      current = Math.min(0.85, Math.max(0.15, offset / span));
      setLiveRatios((ratios) => ratios[divider.id] === current ? ratios : { ...ratios, [divider.id]: current });
    };
    const end = () => {
      dispatch({ type: "resizeSplit", workspaceId: workspace.id, splitId: divider.id, ratio: current });
      setLiveRatios((ratios) => {
        if (!(divider.id in ratios)) return ratios;
        const next = { ...ratios };
        delete next[divider.id];
        return next;
      });
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }

  const blockProps: BlockRenderProps = { workspace, visible, localTerminalAttention, remoteShellIntegrationEnabled, terminalSettingsReady, drag, beginDrag, onRequestClose, onRequestDisconnect, onRequestAuthConnection, onOpenConnectionManager };
  return <div className="workspace-canvas">
    <div ref={layoutSurfaceRef} className="workspace-layout-surface">
      {geometry.leaves.map(({ node, bounds }) => <div key={node.blockId} className="workspace-block-host" data-workspace-block-host={node.blockId} style={boundsStyle(bounds)}>
        <BlockView {...blockProps} node={node}/>
      </div>)}
      {geometry.dividers.map((divider) => <div
        key={`split:${divider.id}`}
        className={`split-divider split-divider-${divider.direction}`}
        role="separator"
        aria-orientation={divider.direction === "horizontal" ? "vertical" : "horizontal"}
        style={boundsStyle(divider.bounds)}
        onPointerDown={(event) => startResize(event, divider)}
      />)}
      <div
        className="active-block-indicator ready"
        aria-hidden="true"
        style={activeBounds ? { ...boundsStyle(activeBounds), opacity: visible ? 1 : 0 } : { opacity: 0 }}
      />
    </div>
    {drag && <div className="drag-ghost" style={{ transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)` }}><Icon name="terminal" /> Terminal</div>}
  </div>;
}

interface BlockRenderProps {
  workspace: Workspace;
  visible: boolean;
  localTerminalAttention: boolean;
  remoteShellIntegrationEnabled: boolean;
  terminalSettingsReady: boolean;
  drag: DragState | null;
  beginDrag: (event: ReactPointerEvent<HTMLElement>, blockId: string) => void;
  onRequestClose: (blockId: string) => void;
  onRequestDisconnect?: (owner: ConnectionOwner, blockId: string, name: string, local: boolean) => void;
  onRequestAuthConnection: (owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => void;
  onOpenConnectionManager?: () => void;
}

function BlockView(props: BlockRenderProps & { node: LayoutLeaf }) {
  if (props.node.type === "terminal") {
    return <TerminalBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId} />;
  }
  if (props.node.type === "files") {
    return <FilesBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId} path={props.node.path}/>;
  }
  if (props.node.type === "network") {
    return <NetworkBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId}/>;
  }
  if (props.node.type === "git") {
    return <GitBlock {...props} blockId={props.node.blockId} target={props.node.target}/>;
  }
  return null;
}

function TerminalBlock(props: BlockRenderProps & { blockId: string; profileId: string | null }) {
  const { document, dispatch, runtimes, profiles, profileGroups = [], splitTerminalBlock, selectBlockTarget, clearBlockBuffer, disconnectBlock, restartLocalBlock } = useWorkspace();
  const requestConnection = props.onRequestAuthConnection;
  const runtime = runtimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const profile = profiles.find((item) => item.id === props.profileId);
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const endpoint = profile && status === "connected" ? `${profile.username}@${profile.host}` : null;
  const detail = endpoint ?? (profile ? status : status === "connected" ? "本机" : status);
  const requestedProfileRef = useRef<string | null>(null);
  const autoOsc7AttentionSessionRef = useRef<string | null>(null);
  const osc7StartupTimerRef = useRef<number | null>(null);
  const osc7AttentionTimerRef = useRef<number | null>(null);
  const [osc7Attention, setOsc7Attention] = useState<{ sequence: number; sessionIdentity: string } | null>(null);
  const sessionActive = status !== "closed" && status !== "failed";
  const sessionActionLabel = status === "closing"
    ? "正在断开"
    : sessionActive
      ? status === "connected" ? props.profileId === null ? "停止本地终端" : "断开连接" : "取消连接"
      : props.profileId === null ? "启动本地终端" : "重新连接";
  const requestDisconnect = () => props.onRequestDisconnect?.("terminal", props.blockId, profile?.name ?? "本地终端", props.profileId === null);

  function runSessionAction() {
    if (status === "closing") return;
    if (sessionActive) {
      if (status === "connected") requestDisconnect();
      else void disconnectBlock(props.blockId);
      return;
    }
    if (props.profileId === null) void restartLocalBlock(props.blockId, props.remoteShellIntegrationEnabled);
    else if (profile) requestConnection("terminal", props.blockId, profile);
  }

  const statusAction = status === "connected" && props.profileId !== null
    ? undefined
    : {
        label: sessionActionLabel,
        icon: sessionActive ? "disconnect" as const : "refresh" as const,
        tone: sessionActive ? "danger" as const : "default" as const,
        disabled: status === "closing",
        onSelect: runSessionAction,
      };

  async function chooseTarget(profileId: string | null) {
    if (profileId !== props.profileId) await selectBlockTarget(props.workspace.id, props.blockId, profileId);
    const target = profiles.find((item) => item.id === profileId);
    requestedProfileRef.current = target?.id ?? null;
    if (target) requestConnection("terminal", props.blockId, target);
  }

  const reportedCwd = props.remoteShellIntegrationEnabled && runtime?.cwdSource === "osc7" ? runtime.cwd : null;
  const localFallbackCwd = runtime?.initialCwd ?? (runtime?.cwdSource === "initial" ? runtime.cwd : null) ?? "~";
  const fallbackCwd = props.profileId === null ? localFallbackCwd : ".";
  const fileBrowserPath = reportedCwd ?? fallbackCwd;
  const sessionIdentity = `${props.profileId ?? "local"}:${runtime?.sessionId ?? "none"}`;
  const osc7AttentionActive = osc7Attention?.sessionIdentity === sessionIdentity;
  const osc7TagState = props.remoteShellIntegrationEnabled && status === "connected"
    ? osc7AttentionActive && !reportedCwd ? "attention" : reportedCwd ? "ready" : "waiting"
    : null;
  const osc7TagMessage = osc7TagState === "attention"
    ? props.profileId === null
      ? "未检测到本地终端的 OSC 7 当前目录，文件管理将自动回退到启动目录。"
      : "未检测到远程终端的 OSC 7 当前目录，文件管理将自动回退到远程主目录。"
    : osc7TagState === "ready"
      ? "OSC 7 初始化成功，已开始跟踪当前终端目录。"
      : "OSC 7 已启用，尚未收到当前会话的目录信息。";
  const cwdButtonTitle = status !== "connected"
    ? "连接终端后打开终端文件夹"
    : reportedCwd
      ? `打开当前目录 ${reportedCwd}`
      : props.profileId === null
        ? `打开启动目录 ${localFallbackCwd}`
        : "打开远程主目录";

  const showOsc7Attention = useCallback(() => {
    if (!props.remoteShellIntegrationEnabled) return;
    if (osc7StartupTimerRef.current !== null) {
      window.clearTimeout(osc7StartupTimerRef.current);
      osc7StartupTimerRef.current = null;
    }
    if (osc7AttentionTimerRef.current !== null) window.clearTimeout(osc7AttentionTimerRef.current);
    setOsc7Attention((attention) => ({
      sequence: (attention?.sequence ?? 0) + 1,
      sessionIdentity,
    }));
    osc7AttentionTimerRef.current = window.setTimeout(() => {
      setOsc7Attention(null);
      osc7AttentionTimerRef.current = null;
    }, TERMINAL_ATTENTION_MS);
  }, [props.remoteShellIntegrationEnabled, sessionIdentity]);

  function openTerminalDirectory() {
    if (props.remoteShellIntegrationEnabled && !reportedCwd) showOsc7Attention();
    dispatch({ type: "openFiles", workspaceId: props.workspace.id, anchorBlockId: props.blockId, profileId: props.profileId, path: fileBrowserPath });
  }

  function openTerminalRepository() {
    if (props.remoteShellIntegrationEnabled && !reportedCwd) showOsc7Attention();
    let target: GitTarget = { type: "unbound" };
    if (props.profileId === null && isAbsoluteLocalPath(fileBrowserPath)) target = { type: "local", path: fileBrowserPath };
    if (props.profileId !== null && isValidRemotePath(fileBrowserPath)) target = { type: "remote", profileId: props.profileId, path: fileBrowserPath };
    dispatch({ type: "openGit", workspaceId: props.workspace.id, anchorBlockId: props.blockId, target });
  }

  useEffect(() => {
    if (!props.remoteShellIntegrationEnabled || status !== "connected" || reportedCwd || autoOsc7AttentionSessionRef.current === sessionIdentity) return;
    autoOsc7AttentionSessionRef.current = sessionIdentity;
    const timer = window.setTimeout(() => {
      osc7StartupTimerRef.current = null;
      showOsc7Attention();
    }, OSC7_REPORT_GRACE_MS);
    osc7StartupTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (osc7StartupTimerRef.current === timer) osc7StartupTimerRef.current = null;
    };
  }, [props.remoteShellIntegrationEnabled, reportedCwd, sessionIdentity, showOsc7Attention, status]);

  useEffect(() => {
    if (props.remoteShellIntegrationEnabled) return;
    autoOsc7AttentionSessionRef.current = null;
    if (osc7StartupTimerRef.current !== null) {
      window.clearTimeout(osc7StartupTimerRef.current);
      osc7StartupTimerRef.current = null;
    }
    if (osc7AttentionTimerRef.current !== null) {
      window.clearTimeout(osc7AttentionTimerRef.current);
      osc7AttentionTimerRef.current = null;
    }
    const resetTimer = window.setTimeout(() => setOsc7Attention(null), 0);
    return () => window.clearTimeout(resetTimer);
  }, [props.remoteShellIntegrationEnabled]);

  useEffect(() => () => {
    if (osc7StartupTimerRef.current !== null) window.clearTimeout(osc7StartupTimerRef.current);
    if (osc7AttentionTimerRef.current !== null) window.clearTimeout(osc7AttentionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!profile || status !== "closed" || requestedProfileRef.current === profile.id) return;
    requestedProfileRef.current = profile.id;
    requestConnection("terminal", props.blockId, profile);
  }, [profile, props.blockId, requestConnection, status]);

  return <section
    className={`terminal-block${active ? " active" : ""}`}
    data-layout-block={props.blockId}
    onPointerDown={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    onFocus={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    tabIndex={0}
    aria-label={`终端 Block ${profile?.name ?? "本地终端"}`}
  >
    <header className="terminal-block-header" onPointerDown={(event) => props.beginDrag(event, props.blockId)}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} hideDetail={Boolean(runtime?.connectionProgress)} localAttention={props.localTerminalAttention} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} onRequestDisconnect={status === "connected" && props.profileId !== null ? requestDisconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={runtime?.connectionProgress} endpoint={endpoint} profile={profile} onRequestDisconnect={status === "connected" && props.profileId !== null ? requestDisconnect : undefined} statusAction={runtime?.connectionProgress ? statusAction : undefined}/>
      {osc7TagState && <abbr key={osc7TagState === "attention" ? osc7Attention?.sequence : "stable"} className="terminal-osc7-tag" data-state={osc7TagState} aria-label={osc7TagMessage} aria-live="polite" title={osc7TagMessage}><span aria-hidden="true">OSC7</span></abbr>}
      <TerminalHeaderActions
        closeDisabled={terminalBlockIds(props.workspace.layout).length === 1}
        onClose={() => props.onRequestClose(props.blockId)}
        actions={[
          { label: "搜索终端输出", icon: "search", onSelect: () => openTerminalSearch(props.blockId) },
          { label: "清除终端缓冲区", icon: "clear", onSelect: () => clearBlockBuffer(props.blockId) },
          { label: "打开仓库管理", title: status === "connected" ? `管理终端目录仓库 ${fileBrowserPath}` : "连接终端后打开仓库管理", icon: "git", disabled: status !== "connected", onSelect: openTerminalRepository },
          { label: "打开终端文件夹", title: cwdButtonTitle, icon: "files", disabled: status !== "connected", onSelect: openTerminalDirectory },
          { label: "打开网络窗口", title: props.profileId ? "使用当前远程连接打开网络窗口" : "本地终端无法创建网络窗口", icon: "network", disabled: !props.profileId, onSelect: () => dispatch({ type: "openNetwork", workspaceId: props.workspace.id, anchorBlockId: props.blockId, profileId: props.profileId }) },
          { label: "左右分割", icon: "splitHorizontal", onSelect: () => splitTerminalBlock(props.workspace.id, props.blockId, "horizontal", props.remoteShellIntegrationEnabled) },
          { label: "上下分割", icon: "splitVertical", onSelect: () => splitTerminalBlock(props.workspace.id, props.blockId, "vertical", props.remoteShellIntegrationEnabled) },
        ]}
      />
    </header>
    <TerminalPanel key={props.profileId ?? "local"} blockId={props.blockId} sessionKey={`${props.blockId}:${props.profileId ?? "local"}`} local={props.profileId === null} visible={props.visible} osc7Enabled={props.remoteShellIntegrationEnabled} terminalSettingsReady={props.terminalSettingsReady}/>
    {runtime?.notice && <BlockNotice message={runtime.notice}/>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function FilesBlock(props: BlockRenderProps & { blockId: string; profileId: string | null; path: string }) {
  const { document, dispatch, fileRuntimes, profiles, profileGroups = [], selectFileTarget, disconnectFileBlock } = useWorkspace();
  const requestConnection = props.onRequestAuthConnection;
  const runtime: FileRuntime = fileRuntimes[props.blockId] ?? (props.profileId === null
    ? { sessionId: null, kind: "local", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null }
    : { sessionId: null, kind: "sftp", status: "closed", hostKeyPrompt: null, notice: "", connectionProgress: null });
  const profile = profiles.find((item) => item.id === props.profileId);
  const endpoint = profile && runtime.status === "connected" ? `${profile.username}@${profile.host}` : null;
  const detail = endpoint ?? (profile ? runtime.status : "本机");
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const requestedProfileRef = useRef<string | null>(null);
  const sessionActive = runtime.status !== "closed" && runtime.status !== "failed";
  const requestDisconnect = () => props.onRequestDisconnect?.("files", props.blockId, profile?.name ?? "远程文件", false);
  const statusAction = profile && runtime.status !== "connected" ? {
    label: runtime.status === "closing" ? "正在断开" : sessionActive ? "取消文件连接" : "重新连接文件",
    icon: sessionActive ? "disconnect" as const : "refresh" as const,
    tone: sessionActive ? "danger" as const : "default" as const,
    disabled: runtime.status === "closing",
    onSelect: () => {
      if (runtime.status === "closing") return;
      if (sessionActive) void disconnectFileBlock(props.blockId);
      else requestConnection("files", props.blockId, profile);
    },
  } : undefined;
  const updatePath = useCallback((path: string) => {
    dispatch({ type: "setFilesPath", workspaceId: props.workspace.id, blockId: props.blockId, profileId: props.profileId, path });
  }, [dispatch, props.blockId, props.profileId, props.workspace.id]);

  async function chooseTarget(profileId: string | null) {
    if (profileId !== props.profileId) await selectFileTarget(props.workspace.id, props.blockId, profileId);
    const target = profiles.find((item) => item.id === profileId);
    requestedProfileRef.current = target?.id ?? null;
    if (target) requestConnection("files", props.blockId, target);
  }
  useEffect(() => {
    if (!profile || runtime.status !== "closed" || requestedProfileRef.current === profile.id) return;
    requestedProfileRef.current = profile.id;
    requestConnection("files", props.blockId, profile);
  }, [profile, props.blockId, requestConnection, runtime.status]);
  return <section
    className={`terminal-block file-browser-block${active ? " active" : ""}`}
    data-layout-block={props.blockId}
    onPointerDown={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    onFocus={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    tabIndex={0}
    aria-label={`文件窗口 ${props.path}`}
  >
    <header className="terminal-block-header" onPointerDown={(event) => props.beginDrag(event, props.blockId)}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={runtime.status} detail={detail} hideDetail={Boolean(runtime.connectionProgress)} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="files" localName="本机文件" localDetail="本地文件系统" ariaContext="文件连接" onRequestDisconnect={runtime.status === "connected" && profile ? requestDisconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={runtime.connectionProgress} endpoint={endpoint} profile={profile} onRequestDisconnect={runtime.status === "connected" && profile ? requestDisconnect : undefined} statusAction={runtime.connectionProgress ? statusAction : undefined}/>
      <div className="block-actions">
        <button aria-label="关闭文件窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button>
      </div>
    </header>
    <FileBrowserPane key={`files:${props.profileId ?? "local"}`} initialPath={props.profileId !== null && props.path === "~" ? "." : props.path} runtime={runtime} onPathChange={updatePath}/>
    {runtime.notice && <BlockNotice message={runtime.notice}/>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function NetworkBlock(props: BlockRenderProps & { blockId: string; profileId: string | null }) {
  const { document, dispatch, profiles, profileGroups = [], networkRuntimes, selectNetworkTarget, disconnectNetworkBlock, startNetworkBlockRule, stopNetworkBlockRule } = useWorkspace();
  const profile = profiles.find((item) => item.id === props.profileId);
  const runtime = networkRuntimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const endpoint = profile && status === "connected" ? `${profile.username}@${profile.host}:${profile.port}` : null;
  const detail = endpoint ?? (profile ? status : "选择 SSH 连接后管理网络规则");
  const pendingRuleIdRef = useRef<string | null>(null);
  const sessionActive = status !== "closed" && status !== "failed";
  const requestDisconnect = () => props.onRequestDisconnect?.("network", props.blockId, profile?.name ?? "网络连接", false);
  const statusAction = profile && status !== "connected" ? {
    label: status === "closing" ? "正在断开" : sessionActive ? "取消网络连接" : "重新连接网络",
    icon: sessionActive ? "disconnect" as const : "refresh" as const,
    tone: sessionActive ? "danger" as const : "default" as const,
    disabled: status === "closing",
    onSelect: () => {
      if (status === "closing") return;
      if (sessionActive) void disconnectNetworkBlock(props.blockId);
      else props.onRequestAuthConnection("network", props.blockId, profile);
    },
  } : undefined;
  const lockedRuleIds = new Set(Object.values(networkRuntimes).flatMap((item) => Object.entries(item.ruleStates)
    .filter(([, state]) => state === "starting" || state === "running" || state === "stopping")
    .map(([ruleId]) => ruleId)));

  async function chooseTarget(profileId: string | null) {
    pendingRuleIdRef.current = null;
    if (profileId !== props.profileId) await selectNetworkTarget(props.workspace.id, props.blockId, profileId);
  }

  async function startRule(ruleId: string) {
    if (!profile) return;
    if (runtime?.status === "connected") {
      await startNetworkBlockRule(props.blockId, ruleId);
      return;
    }
    pendingRuleIdRef.current = ruleId;
    props.onRequestAuthConnection("network", props.blockId, profile);
  }

  useEffect(() => {
    const ruleId = pendingRuleIdRef.current;
    if (!ruleId || status !== "connected") return;
    pendingRuleIdRef.current = null;
    void startNetworkBlockRule(props.blockId, ruleId);
  }, [props.blockId, startNetworkBlockRule, status]);

  return <section
    className={`terminal-block network-block${active ? " active" : ""}`}
    data-layout-block={props.blockId}
    onPointerDown={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    onFocus={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    tabIndex={0}
    aria-label={`网络窗口 ${profile?.name ?? "未选择连接"}`}
  >
    <header className="terminal-block-header" onPointerDown={(event) => props.beginDrag(event, props.blockId)}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} hideDetail={Boolean(runtime?.connectionProgress)} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="network" localName="选择连接" localDetail="Network Block 需要远程 SSH 连接" ariaContext="网络连接" allowLocal={false} onRequestDisconnect={status === "connected" && profile ? requestDisconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={runtime?.connectionProgress} endpoint={endpoint} profile={profile} onRequestDisconnect={status === "connected" && profile ? requestDisconnect : undefined} statusAction={runtime?.connectionProgress ? statusAction : undefined}/>
      <div className="block-actions"><button aria-label="关闭网络窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button></div>
    </header>
    <NetworkPane profileId={props.profileId} profileHost={profile?.host} runtimeStates={runtime?.ruleStates} lockedRuleIds={lockedRuleIds} onStart={(rule) => void startRule(rule.id)} onStop={(rule) => void stopNetworkBlockRule(props.blockId, rule.id)}/>
    {runtime?.notice && <BlockNotice message={runtime.notice}/>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function GitBlock(props: BlockRenderProps & { blockId: string; target: GitTarget }) {
  const { document, dispatch, profiles, profileGroups = [], gitRuntimes, selectGitTarget, disconnectGitBlock } = useWorkspace();
  const { blockId, onRequestAuthConnection, target, workspace } = props;
  const workspaceId = workspace.id;
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const profileId = props.target.type === "remote" ? props.target.profileId : null;
  const profile = profiles.find((item) => item.id === profileId);
  const runtime = gitRuntimes[props.blockId];
  const status = props.target.type === "remote" ? runtime?.status ?? "closed" : "connected";
  const path = props.target.type === "unbound" ? null : props.target.path;
  const name = path?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Git 管理";
  const requestedProfileRef = useRef<string | null>(null);
  const [pendingRemote, setPendingRemote] = useState<{ profileId: string; path: string } | null>(null);
  const [repositoryPickerProfileId, setRepositoryPickerProfileId] = useState<string | null>(null);
  const repositoryHistory = document?.recentGitRepositories ?? [];
  const visibleRepositoryHistory = recentGitRepositoriesForScope(repositoryHistory, target.type === "remote"
    ? { type: "remote", profileId: target.profileId }
    : { type: "local" });
  const currentRepository: GitRepositoryHistoryEntry | null = target.type === "unbound" ? null : target;
  const pendingRepositoryHistory = pendingRemote
    ? recentGitRepositoriesForScope(repositoryHistory, { type: "remote", profileId: pendingRemote.profileId })
    : [];
  const sessionActive = status !== "closed" && status !== "failed";
  const endpoint = profile && status === "connected" ? `${profile.username}@${profile.host}:${profile.port}` : null;
  const detail = props.target.type === "remote"
    ? endpoint ?? (profile ? status : "连接配置不存在")
    : props.target.type === "local" ? "本机仓库" : "选择本机或 SSH 工作区";
  const requestDisconnect = () => props.onRequestDisconnect?.("git", props.blockId, profile?.name ?? "远程 Git", false);
  const statusAction = profile && props.target.type === "remote" && status !== "connected" ? {
    label: status === "closing" ? "正在断开" : sessionActive ? "取消 Git 连接" : "重新连接 Git",
    icon: sessionActive ? "disconnect" as const : "refresh" as const,
    tone: sessionActive ? "danger" as const : "default" as const,
    disabled: status === "closing",
    onSelect: () => sessionActive ? void disconnectGitBlock(props.blockId) : props.onRequestAuthConnection("git", props.blockId, profile),
  } : undefined;

  async function chooseTarget(nextProfileId: string | null) {
    requestedProfileRef.current = nextProfileId;
    if (nextProfileId === null) {
      setPendingRemote(null);
      await selectGitTarget(props.workspace.id, props.blockId, { type: "unbound" });
      return;
    }
    setPendingRemote({ profileId: nextProfileId, path: "" });
  }

  async function applyRemoteTarget(selectedPath?: string) {
    const remotePath = (selectedPath ?? pendingRemote?.path ?? "").trim();
    const nextProfile = profiles.find((item) => item.id === pendingRemote?.profileId);
    if (!pendingRemote || !remotePath || !nextProfile) return;
    const target: GitTarget = { type: "remote", profileId: pendingRemote.profileId, path: remotePath };
    await selectGitTarget(props.workspace.id, props.blockId, target);
    setPendingRemote(null);
    props.onRequestAuthConnection("git", props.blockId, nextProfile);
  }

  const retargetGit = useCallback(async (target: GitTarget) => {
    if (target.type === "remote") requestedProfileRef.current = null;
    await selectGitTarget(workspaceId, blockId, target);
  }, [blockId, selectGitTarget, workspaceId]);

  const requestRepositoryChange = useCallback(async () => {
    if (pendingRemote) return;
    if (target.type !== "remote") {
      const initialPath = target.type === "local" ? target.path : null;
      const nextPath = await selectGitRepositoryDirectory(initialPath);
      if (nextPath) await retargetGit({ type: "local", path: nextPath });
      return;
    }
    if (!profile) return;
    setRepositoryPickerProfileId(profile.id);
    if (status !== "connected" || !runtime?.sessionId) onRequestAuthConnection("git", blockId, profile);
  }, [blockId, onRequestAuthConnection, pendingRemote, profile, retargetGit, runtime?.sessionId, status, target]);

  useEffect(() => {
    if (target.type !== "remote" || !profile || status !== "closed" || requestedProfileRef.current === profile.id) return;
    requestedProfileRef.current = profile.id;
    onRequestAuthConnection("git", blockId, profile);
  }, [blockId, onRequestAuthConnection, profile, status, target.type]);

  const repositoryPickerOpen = target.type === "remote"
    && repositoryPickerProfileId === target.profileId
    && runtime?.status === "connected"
    && Boolean(runtime.sessionId);

  return <section
    className={`terminal-block git-block${active ? " active" : ""}`}
    data-layout-block={props.blockId}
    onPointerDown={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    onFocus={() => dispatch({ type: "selectBlock", workspaceId: props.workspace.id, blockId: props.blockId })}
    tabIndex={0}
    aria-label={`Git 管理 ${name}`}
  >
    <header className="terminal-block-header" onPointerDown={(event) => props.beginDrag(event, props.blockId)}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={pendingRemote?.profileId ?? profileId} status={status} detail={detail} hideDetail={Boolean(runtime?.connectionProgress)} onSelect={(nextProfileId) => void chooseTarget(nextProfileId)} onManageConnections={props.onOpenConnectionManager} icon="git" localName="本机仓库" localDetail="管理本机 Git 工作区" ariaContext="Git 连接" onRequestDisconnect={status === "connected" && profile ? requestDisconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={runtime?.connectionProgress} endpoint={endpoint} profile={profile} onRequestDisconnect={status === "connected" && profile ? requestDisconnect : undefined} statusAction={runtime?.connectionProgress ? statusAction : undefined}/>
      <div className="block-actions">
        <GitRepositoryHistoryPopover
          repositories={visibleRepositoryHistory}
          currentRepository={currentRepository}
          triggerLabel={props.target.type === "remote" ? "打开远程仓库" : "打开本机仓库"}
          disabled={Boolean(pendingRemote) || (props.target.type === "remote" && !profile)}
          onSelect={(repository) => {
            if (currentRepository && isSameGitRepository(currentRepository, repository)) return;
            void retargetGit(repository);
          }}
          onBrowse={() => void requestRepositoryChange()}
        />
        <button aria-label="关闭 Git 窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button>
      </div>
    </header>
    {pendingRemote ? <form className="git-target-config" onSubmit={(event) => { event.preventDefault(); void applyRemoteTarget(); }}>
      <Icon name="git" size={28}/><strong>设置远程仓库路径</strong><span>路径位于“{profiles.find((item) => item.id === pendingRemote.profileId)?.name ?? "SSH 服务器"}”上，不会复用终端会话。</span>
      {pendingRepositoryHistory.length > 0 && <section className="git-target-history" aria-label="该连接的最近仓库">
        <span>最近仓库</span>
        <div className="git-target-history-scroll">
          <GitRepositoryHistoryList
            repositories={pendingRepositoryHistory}
            currentRepository={null}
            ariaLabel="该连接的最近仓库"
            onSelect={(repository) => void applyRemoteTarget(repository.path)}
          />
        </div>
      </section>}
      <label htmlFor={`git-remote-path-${props.blockId}`}><RequiredFieldLabel>远程工作目录</RequiredFieldLabel></label>
      <ExactTextInput id={`git-remote-path-${props.blockId}`} required autoFocus value={pendingRemote.path} maxLength={4096} placeholder="/srv/project" onChange={(event) => setPendingRemote({ ...pendingRemote, path: event.target.value })}/>
      <div><button type="button" className="secondary" onClick={() => setPendingRemote(null)}>取消</button><button type="submit" disabled={!pendingRemote.path.trim()}>连接并打开</button></div>
    </form> : <GitPane
      blockId={props.blockId}
      target={props.target}
      runtime={runtime}
      visible={props.visible}
      onTargetChange={retargetGit}
      onRequestRepositoryChange={() => void requestRepositoryChange()}
      onRepositoryOpened={(repository) => dispatch({ type: "recordRecentGitRepository", repository })}
    />}
    {repositoryPickerOpen && target.type === "remote" && runtime?.sessionId && <GitRepositoryPickerDialog
      sessionId={runtime.sessionId}
      profileId={target.profileId}
      initialPath={target.path}
      onClose={() => setRepositoryPickerProfileId(null)}
      onSelect={(nextPath) => {
        setRepositoryPickerProfileId(null);
        if (nextPath !== target.path) void retargetGit({ ...target, path: nextPath });
      }}
    />}
    {runtime?.notice && <BlockNotice message={runtime.notice}/>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function dropPosition(rect: DOMRect, x: number, y: number): DropPosition {
  const relativeX = (x - rect.left) / rect.width;
  const relativeY = (y - rect.top) / rect.height;
  if (relativeX < 0.25) return "left";
  if (relativeX > 0.75) return "right";
  if (relativeY < 0.25) return "top";
  if (relativeY > 0.75) return "bottom";
  return "center";
}

function boundsStyle(bounds: LayoutBounds): CSSProperties {
  return {
    left: layoutScalarCss(bounds.x),
    top: layoutScalarCss(bounds.y),
    width: layoutScalarCss(bounds.width),
    height: layoutScalarCss(bounds.height),
  };
}
