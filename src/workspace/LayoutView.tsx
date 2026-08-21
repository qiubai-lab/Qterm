import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "../components/Icon";
import { FileBrowserPane } from "../files/FileBrowserPane";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { NetworkPane } from "../network/NetworkPane";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { terminalBlockIds, type DropPosition } from "./layout";
import type { LayoutNode, SplitNode, Workspace } from "./model";
import { TerminalTargetPicker } from "./TerminalTargetPicker";
import { useWorkspace, type FileRuntime } from "./WorkspaceProvider";

export type ConnectionOwner = "terminal" | "files" | "network";

interface DragState {
  sourceId: string;
  targetId: string | null;
  position: DropPosition | null;
  x: number;
  y: number;
}

interface IndicatorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  ready: boolean;
}

export function WorkspaceCanvas({ workspace, visible, onRequestClose, onRequestAuthConnection, onOpenConnectionManager }: { workspace: Workspace; visible: boolean; onRequestClose: (blockId: string) => void; onRequestAuthConnection: (owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => void; onOpenConnectionManager?: () => void }) {
  const { dispatch } = useWorkspace();
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [indicatorBounds, setIndicatorBounds] = useState<IndicatorBounds | null>(null);
  const indicatorPositionedRef = useRef(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const target = Array.from(canvas.querySelectorAll<HTMLElement>("[data-layout-block]"))
      .find((element) => element.dataset.layoutBlock === workspace.activeBlockId);
    if (!target) return;
    const update = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setIndicatorBounds({
        x: targetRect.left - canvasRect.left,
        y: targetRect.top - canvasRect.top,
        width: targetRect.width,
        height: targetRect.height,
        ready: indicatorPositionedRef.current,
      });
      indicatorPositionedRef.current = true;
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible, workspace.activeBlockId, workspace.layout]);

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

  return <div ref={canvasRef} className="workspace-canvas">
    <LayoutBranch node={workspace.layout} workspace={workspace} visible={visible} drag={drag} beginDrag={beginDrag} onRequestClose={onRequestClose} onRequestAuthConnection={onRequestAuthConnection} onOpenConnectionManager={onOpenConnectionManager} />
    <div
      className={`active-block-indicator${indicatorBounds?.ready ? " ready" : ""}`}
      aria-hidden="true"
      style={indicatorBounds ? {
        width: `${indicatorBounds.width}px`,
        height: `${indicatorBounds.height}px`,
        opacity: visible ? 1 : 0,
        transform: `translate3d(${indicatorBounds.x}px, ${indicatorBounds.y}px, 0)`,
      } : { opacity: 0 }}
    />
    {drag && <div className="drag-ghost" style={{ transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)` }}><Icon name="terminal" /> Terminal</div>}
  </div>;
}

function LayoutBranch(props: { node: LayoutNode; workspace: Workspace; visible: boolean; drag: DragState | null; beginDrag: (event: ReactPointerEvent<HTMLElement>, blockId: string) => void; onRequestClose: (blockId: string) => void; onRequestAuthConnection: (owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => void; onOpenConnectionManager?: () => void }) {
  if (props.node.type === "terminal") {
    return <TerminalBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId} />;
  }
  if (props.node.type === "files") {
    return <FilesBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId} path={props.node.path}/>;
  }
  if (props.node.type === "network") {
    return <NetworkBlock {...props} blockId={props.node.blockId} profileId={props.node.profileId}/>;
  }
  return <SplitBranch {...props} node={props.node} />;
}

function SplitBranch(props: Omit<Parameters<typeof LayoutBranch>[0], "node"> & { node: SplitNode }) {
  const { dispatch } = useWorkspace();
  const [liveRatio, setLiveRatio] = useState<number | null>(null);
  const ratio = liveRatio ?? props.node.ratio;
  const containerRef = useRef<HTMLDivElement>(null);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);
    let current = ratio;
    const move = (pointer: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = props.node.direction === "horizontal" ? (pointer.clientX - rect.left) / rect.width : (pointer.clientY - rect.top) / rect.height;
      current = Math.min(0.85, Math.max(0.15, raw));
      setLiveRatio(current);
    };
    const end = () => {
      dispatch({ type: "resizeSplit", workspaceId: props.workspace.id, splitId: props.node.id, ratio: current });
      setLiveRatio(null);
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
  }

  const childProps = { ...props };
  return <div ref={containerRef} className={`split split-${props.node.direction}`}>
    <div className="split-child" style={{ flexBasis: `${ratio * 100}%` }}><LayoutBranch {...childProps} node={props.node.first} /></div>
    <div className="split-divider" role="separator" aria-orientation={props.node.direction === "horizontal" ? "vertical" : "horizontal"} onPointerDown={startResize} />
    <div className="split-child" style={{ flexBasis: `${(1 - ratio) * 100}%` }}><LayoutBranch {...childProps} node={props.node.second} /></div>
  </div>;
}

function TerminalBlock(props: Omit<Parameters<typeof LayoutBranch>[0], "node"> & { blockId: string; profileId: string | null }) {
  const { document, dispatch, runtimes, profiles, profileGroups = [], selectBlockTarget, clearBlockBuffer } = useWorkspace();
  const requestConnection = props.onRequestAuthConnection;
  const runtime = runtimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const profile = profiles.find((item) => item.id === props.profileId);
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const detail = profile && status === "connected" ? `${profile.username}@${profile.host}` : profile ? status : status === "connected" ? "本机" : status;
  const requestedProfileRef = useRef<string | null>(null);

  async function chooseTarget(profileId: string | null) {
    if (profileId !== props.profileId) await selectBlockTarget(props.workspace.id, props.blockId, profileId);
    const target = profiles.find((item) => item.id === profileId);
    requestedProfileRef.current = target?.id ?? null;
    if (target) requestConnection("terminal", props.blockId, target);
  }

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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager}/>
      <div className="block-actions">
        <button aria-label="清除终端缓冲区" title="清除终端缓冲区" onClick={() => clearBlockBuffer(props.blockId)}><Icon name="clear" size={13}/></button>
        <button aria-label="打开当前文件夹" title={runtime?.cwd ? `打开 ${runtime.cwd}` : "打开当前文件夹"} disabled={status !== "connected"} onClick={() => dispatch({ type: "openFiles", workspaceId: props.workspace.id, anchorBlockId: props.blockId, profileId: props.profileId, path: runtime?.cwd ?? (props.profileId === null ? "~" : ".") })}><Icon name="files" size={13}/></button>
        <button aria-label="打开网络窗口" title={props.profileId ? "使用当前远程连接打开网络窗口" : "本地终端无法创建网络窗口"} disabled={!props.profileId} onClick={() => dispatch({ type: "openNetwork", workspaceId: props.workspace.id, anchorBlockId: props.blockId, profileId: props.profileId })}><Icon name="network" size={13}/></button>
        <button aria-label="左右分割" title="左右分割" onClick={() => dispatch({ type: "splitBlock", workspaceId: props.workspace.id, blockId: props.blockId, direction: "horizontal" })}><Icon name="splitHorizontal" size={13}/></button>
        <button aria-label="上下分割" title="上下分割" onClick={() => dispatch({ type: "splitBlock", workspaceId: props.workspace.id, blockId: props.blockId, direction: "vertical" })}><Icon name="splitVertical" size={13}/></button>
        <button aria-label="关闭终端" title="关闭" disabled={terminalBlockIds(props.workspace.layout).length === 1} onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button>
      </div>
    </header>
    <TerminalPanel key={props.profileId ?? "local"} blockId={props.blockId} sessionKey={`${props.blockId}:${props.profileId ?? "local"}`} local={props.profileId === null} visible={props.visible} />
    {runtime?.notice && <div className="block-notice">{runtime.notice}</div>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function FilesBlock(props: Omit<Parameters<typeof LayoutBranch>[0], "node"> & { blockId: string; profileId: string | null; path: string }) {
  const { document, dispatch, fileRuntimes, profiles, profileGroups = [], selectFileTarget } = useWorkspace();
  const requestConnection = props.onRequestAuthConnection;
  const runtime: FileRuntime = fileRuntimes[props.blockId] ?? (props.profileId === null
    ? { sessionId: null, kind: "local", status: "connected", hostKeyPrompt: null, notice: "" }
    : { sessionId: null, kind: "sftp", status: "closed", hostKeyPrompt: null, notice: "" });
  const profile = profiles.find((item) => item.id === props.profileId);
  const detail = profile && runtime.status === "connected" ? `${profile.username}@${profile.host}` : profile ? runtime.status : "本机";
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const requestedProfileRef = useRef<string | null>(null);
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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={runtime.status} detail={detail} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="files" localName="本机文件" localDetail="本地文件系统" ariaContext="文件连接"/>
      <div className="block-actions">
        <button aria-label="关闭文件窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button>
      </div>
    </header>
    <FileBrowserPane key={`files:${props.profileId ?? "local"}`} initialPath={props.profileId !== null && props.path === "~" ? "." : props.path} runtime={runtime} onPathChange={updatePath}/>
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function NetworkBlock(props: Omit<Parameters<typeof LayoutBranch>[0], "node"> & { blockId: string; profileId: string | null }) {
  const { document, dispatch, profiles, profileGroups = [], networkRuntimes, selectNetworkTarget, startNetworkBlockRule, stopNetworkBlockRule } = useWorkspace();
  const profile = profiles.find((item) => item.id === props.profileId);
  const runtime = networkRuntimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const detail = profile ? (status === "connected" ? `${profile.username}@${profile.host}:${profile.port}` : status) : "选择 SSH 连接后管理网络规则";
  const pendingRuleIdRef = useRef<string | null>(null);
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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="network" localName="选择连接" localDetail="Network Block 需要远程 SSH 连接" ariaContext="网络连接" allowLocal={false}/>
      <div className="block-actions"><button aria-label="关闭网络窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button></div>
    </header>
    <NetworkPane profileId={props.profileId} runtimeStates={runtime?.ruleStates} lockedRuleIds={lockedRuleIds} onStart={(rule) => void startRule(rule.id)} onStop={(rule) => void stopNetworkBlockRule(props.blockId, rule.id)}/>
    {runtime?.notice && <div className="block-notice">{runtime.notice}</div>}
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
