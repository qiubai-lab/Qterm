import type { PointerEvent } from "react";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { WebNode } from "../workspace/model";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { TerminalTargetPicker } from "../workspace/TerminalTargetPicker";
import { BlockHeaderClose } from "../workspace/BlockHeaderClose";
import { ConnectionRouteProgress } from "../components/ConnectionRouteProgress";
import { WebBrowserPane } from "./WebBrowserPane";
import { useWebTargetSwitch } from "./useWebTargetSwitch";
import { supportsWebBlocks } from "./webModel";
import "./webBlock.css";

interface Props {
  workspaceId: string;
  node: WebNode;
  visible: boolean;
  active: boolean;
  onClose: () => void;
  onConnect: (profile: ConnectionProfile) => void;
  onManageConnections?: () => void;
  onHeaderPointerDown?: (event: PointerEvent<HTMLElement>) => void;
}

export function WebBlock({ workspaceId, node, visible, active, onClose, onConnect, onManageConnections, onHeaderPointerDown }: Props) {
  const { document, profiles, profileGroups = [], networkRuntimes, dispatch, disconnectNetworkBlock, selectNetworkTarget } = useWorkspace();
  const profile = profiles.find(item => item.id === node.profileId);
  const runtime = networkRuntimes[node.blockId];
  const target = useWebTargetSwitch(workspaceId, node, selectNetworkTarget);
  const status = target.switching ? "closing" : runtime?.status ?? "closed";
  const connected = status === "connected";
  const sessionActive = status !== "closed" && status !== "failed";
  const supported = supportsWebBlocks();
  const endpoint = profile && connected ? `${profile.username}@${profile.host}` : null;
  const progress = target.switching ? null : runtime?.connectionProgress;
  const select = () => dispatch({ type: "selectBlock", workspaceId, blockId: node.blockId });
  const connect = () => { if (profile && !target.switching && supported) onConnect(profile); };
  const disconnect = () => { void disconnectNetworkBlock(node.blockId); };
  const statusAction = profile && !connected ? {
    label: target.switching ? "正在切换连接" : sessionActive ? "取消网页连接" : "连接网页",
    icon: sessionActive ? "disconnect" as const : "refresh" as const,
    tone: sessionActive ? "danger" as const : "default" as const,
    disabled: !supported || status === "closing",
    onSelect: () => sessionActive ? disconnect() : connect(),
  } : undefined;

  return <section className={`terminal-block web-block${active ? " active" : ""}`} data-layout-block={node.blockId} aria-label={`网页 Block ${profile?.name ?? "未选择连接"}`} tabIndex={0} onPointerDown={select} onFocus={select}>
    <header className="terminal-block-header" onPointerDown={onHeaderPointerDown}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={node.profileId} status={status} detail={target.switching ? "正在切换连接…" : endpoint ?? (profile ? status : "选择 SSH 连接")} hideDetail={Boolean(progress)} onSelect={id => void target.choose(id)} onManageConnections={onManageConnections} icon="browser" localName="选择连接" ariaContext="网页连接" allowLocal={false} onRequestDisconnect={connected ? disconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={progress} endpoint={endpoint} profile={profile} onRequestDisconnect={connected ? disconnect : undefined} statusAction={progress ? statusAction : undefined}/>
      <BlockHeaderClose label="关闭网页" onClose={onClose}/>
    </header>
    {target.switching
      ? <div className="web-browser-surface web-empty-state" role="status">正在断开原连接…</div>
      : <WebBrowserPane key={node.profileId ?? "unbound"} profileId={profile?.id ?? null} sessionId={connected ? runtime?.sessionId ?? null : null} connecting={sessionActive && !connected} visible={visible} supported={supported} notice={target.error || runtime?.notice || ""} onConnect={connect} onActivate={select}/>}
  </section>;
}
