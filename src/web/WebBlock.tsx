import { useCallback, useState, type PointerEvent } from "react";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { WebNode } from "../workspace/model";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import { TerminalTargetPicker } from "../workspace/TerminalTargetPicker";
import { BlockHeaderClose } from "../workspace/BlockHeaderClose";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { Icon } from "../components/Icon";
import { ConnectionRouteProgress } from "../components/ConnectionRouteProgress";
import { WebTunnelNotice } from "./WebTunnelNotice";
import { WebTabs } from "./WebTabs";
import { useWebTargetSwitch } from "./useWebTargetSwitch";
import { supportsWebBlocks, webSupportNotice } from "./webModel";
import { usesTunnelAddressMapping } from "../lib/tauri/webCapabilities";
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
  const [tabHeader, setTabHeader] = useState<HTMLDivElement | null>(null);
  const { document, profiles, profileGroups = [], networkRuntimes, dispatch, disconnectNetworkBlock, selectNetworkTarget, registerWebOpener, webTabSessions, hydrated } = useWorkspace();
  const profile = profiles.find(item => item.id === node.profileId);
  const local = node.profileId === null;
  const available = local || Boolean(profile);
  const registerOpener = useCallback((open: (url: string) => void) => registerWebOpener?.(node.blockId, node.profileId, open) ?? (() => {}), [node.blockId, node.profileId, registerWebOpener]);
  const runtime = networkRuntimes[node.blockId];
  const target = useWebTargetSwitch(workspaceId, node, selectNetworkTarget);
  const status = target.switching ? "closing" : local ? "connected" : runtime?.status ?? "closed";
  const connected = status === "connected";
  const sessionActive = !local && status !== "closed" && status !== "failed";
  const supported = supportsWebBlocks(node.profileId);
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

  return <section className={`terminal-block web-block${active ? " active" : ""}`} data-layout-block={node.blockId} aria-label={`网页 Block ${profile?.name ?? (local ? "本地" : "连接已失效")}`} tabIndex={0} onPointerDown={select} onFocus={select}>
    <header className="terminal-block-header" onPointerDown={onHeaderPointerDown}>
      <TerminalTargetPicker profiles={profiles} groups={profileGroups} recentProfileIds={document?.recentProfileIds ?? []} selectedProfileId={node.profileId} status={status} detail={target.switching ? "正在切换连接…" : local ? "使用本机网络" : endpoint ?? (profile ? status : "连接已失效")} hideDetail={Boolean(progress)} onSelect={id => void target.choose(id)} onManageConnections={onManageConnections} icon="browser" localName="本地" localDetail="使用本机网络" ariaContext="网页连接" onRequestDisconnect={connected && !local ? disconnect : undefined} statusAction={statusAction}/>
      <ConnectionRouteProgress progress={progress} endpoint={endpoint} profile={profile} onRequestDisconnect={connected ? disconnect : undefined} statusAction={progress ? statusAction : undefined}/>
      <div className="web-tabs-slot" ref={setTabHeader}/>
      <BlockHeaderClose label="关闭网页" onClose={onClose}>
        {!local && supported && usesTunnelAddressMapping() && <WebTunnelNotice/>}
        <ThemedTooltipButton aria-label="左右分割网页" tooltip="左右分割网页" disabled={!available || !supported || target.switching} onClick={() => dispatch({ type: "openWeb", workspaceId, anchorBlockId: node.blockId, profileId: node.profileId, direction: "horizontal" })}><Icon name="splitHorizontal" size={13}/></ThemedTooltipButton>
        <ThemedTooltipButton aria-label="上下分割网页" tooltip="上下分割网页" disabled={!available || !supported || target.switching} onClick={() => dispatch({ type: "openWeb", workspaceId, anchorBlockId: node.blockId, profileId: node.profileId, direction: "vertical" })}><Icon name="splitVertical" size={13}/></ThemedTooltipButton>
      </BlockHeaderClose>
    </header>
    {hydrated === false ? <div className="web-browser-surface web-empty-state" role="status">正在恢复浏览器标签…</div> : target.switching
      ? <div className="web-browser-surface web-empty-state" role="status">正在断开原连接…</div>
      : <WebTabs active={active} header={tabHeader} sessionStore={webTabSessions} blockId={node.blockId} onHeaderPointerDown={onHeaderPointerDown} registerOpener={available && supported ? registerOpener : undefined} key={node.profileId ?? "local"} profileId={node.profileId} profileName={profile?.name ?? (local ? "本地" : "连接已失效")} sessionId={connected && !local ? runtime?.sessionId ?? null : null} connecting={sessionActive && !connected} visible={visible} supported={supported && available} notice={target.error || (!supported ? webSupportNotice(node.profileId) : "") || (!available ? "连接已失效，请重新选择连接" : local ? "" : runtime?.notice || "")} onConnect={connect} onActivate={select}/>}
  </section>;
}
