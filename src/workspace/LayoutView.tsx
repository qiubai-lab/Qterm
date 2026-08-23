import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "../components/Icon";
import { ConnectionRouteProgress } from "../components/ConnectionRouteProgress";
import { FileBrowserPane } from "../files/FileBrowserPane";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { NetworkPane } from "../network/NetworkPane";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { terminalBlockIds, type DropPosition } from "./layout";
import { calculateLayoutGeometry, layoutScalarCss, resolveLayoutBounds, type LayoutBounds, type LayoutDividerGeometry } from "./layoutGeometry";
import type { LayoutLeaf, Workspace } from "./model";
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

function BlockNotice({ message }: { message: string }) {
  return <div className="block-notice" role="alert" aria-live="assertive" aria-atomic="true">{message}</div>;
}

export function WorkspaceCanvas({ workspace, visible, onRequestClose, onRequestAuthConnection, onOpenConnectionManager }: { workspace: Workspace; visible: boolean; onRequestClose: (blockId: string) => void; onRequestAuthConnection: (owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => void; onOpenConnectionManager?: () => void }) {
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

  const blockProps: BlockRenderProps = { workspace, visible, drag, beginDrag, onRequestClose, onRequestAuthConnection, onOpenConnectionManager };
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
        style={activeBounds ? { ...indicatorBoundsStyle(activeBounds), opacity: visible ? 1 : 0 } : { opacity: 0 }}
      />
    </div>
    {drag && <div className="drag-ghost" style={{ transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)` }}><Icon name="terminal" /> Terminal</div>}
  </div>;
}

interface BlockRenderProps {
  workspace: Workspace;
  visible: boolean;
  drag: DragState | null;
  beginDrag: (event: ReactPointerEvent<HTMLElement>, blockId: string) => void;
  onRequestClose: (blockId: string) => void;
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
  return null;
}

function TerminalBlock(props: BlockRenderProps & { blockId: string; profileId: string | null }) {
  const { document, dispatch, runtimes, profiles, profileGroups = [], selectBlockTarget, clearBlockBuffer } = useWorkspace();
  const requestConnection = props.onRequestAuthConnection;
  const runtime = runtimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const profile = profiles.find((item) => item.id === props.profileId);
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const endpoint = profile && status === "connected" ? `${profile.username}@${profile.host}` : null;
  const detail = endpoint ?? (profile ? status : status === "connected" ? "本机" : status);
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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} hideDetail={Boolean(runtime?.connectionProgress)} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager}/>
      <ConnectionRouteProgress progress={runtime?.connectionProgress} endpoint={endpoint} profile={profile}/>
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
    {runtime?.notice && <BlockNotice message={runtime.notice}/>}
    {drop && <div className={`drop-zone drop-${drop}`} />}
  </section>;
}

function FilesBlock(props: BlockRenderProps & { blockId: string; profileId: string | null; path: string }) {
  const { document, dispatch, fileRuntimes, profiles, profileGroups = [], selectFileTarget } = useWorkspace();
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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={runtime.status} detail={detail} hideDetail={Boolean(runtime.connectionProgress)} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="files" localName="本机文件" localDetail="本地文件系统" ariaContext="文件连接"/>
      <ConnectionRouteProgress progress={runtime.connectionProgress} endpoint={endpoint} profile={profile}/>
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
  const { document, dispatch, profiles, profileGroups = [], networkRuntimes, selectNetworkTarget, startNetworkBlockRule, stopNetworkBlockRule } = useWorkspace();
  const profile = profiles.find((item) => item.id === props.profileId);
  const runtime = networkRuntimes[props.blockId];
  const active = props.workspace.activeBlockId === props.blockId;
  const drop = props.drag?.targetId === props.blockId ? props.drag.position : null;
  const status = runtime?.status ?? "closed";
  const endpoint = profile && status === "connected" ? `${profile.username}@${profile.host}:${profile.port}` : null;
  const detail = endpoint ?? (profile ? status : "选择 SSH 连接后管理网络规则");
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
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={props.profileId} status={status} detail={detail} hideDetail={Boolean(runtime?.connectionProgress)} onSelect={(profileId) => void chooseTarget(profileId)} onManageConnections={props.onOpenConnectionManager} icon="network" localName="选择连接" localDetail="Network Block 需要远程 SSH 连接" ariaContext="网络连接" allowLocal={false}/>
      <ConnectionRouteProgress progress={runtime?.connectionProgress} endpoint={endpoint} profile={profile}/>
      <div className="block-actions"><button aria-label="关闭网络窗口" title="关闭" onClick={() => props.onRequestClose(props.blockId)}><Icon name="close" size={13}/></button></div>
    </header>
    <NetworkPane profileId={props.profileId} profileHost={profile?.host} runtimeStates={runtime?.ruleStates} lockedRuleIds={lockedRuleIds} onStart={(rule) => void startRule(rule.id)} onStop={(rule) => void stopNetworkBlockRule(props.blockId, rule.id)}/>
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

function indicatorBoundsStyle(bounds: LayoutBounds): CSSProperties {
  return {
    width: layoutScalarCss(bounds.width),
    height: layoutScalarCss(bounds.height),
    transform: `translate3d(${layoutScalarCss(bounds.x)}, ${layoutScalarCss(bounds.y)}, 0)`,
  };
}
