import { useId, useState } from "react";

import type { ConnectionRouteNodeProgress, ConnectionRouteNodeState, ConnectionRouteProgressState } from "../workspace/connectionProgress";

export function ConnectionRouteProgress({ progress, endpoint }: { progress: ConnectionRouteProgressState | null | undefined; endpoint?: string | null }) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [focusedNode, setFocusedNode] = useState<number | null>(null);
  const tooltipId = useId();
  if (!progress) return null;

  const validHoveredNode = hoveredNode !== null && hoveredNode < progress.nodes.length ? hoveredNode : null;
  const validFocusedNode = focusedNode !== null && focusedNode < progress.nodes.length ? focusedNode : null;
  const inspectedNode = validFocusedNode ?? validHoveredNode;

  return <div className={`connection-route-progress ${progress.phase}`}>
    <span className="connection-route-live-status" role="status" aria-live="polite">{progress.message}</span>
    <div className="connection-route-dots" role="group" aria-label={`${progress.completedNodes}/${progress.totalNodes} 个节点已连接`}>
      {progress.nodes.map((node) => <span
        key={node.index}
        className="connection-route-node-anchor"
        onPointerEnter={() => setHoveredNode(node.index)}
        onPointerLeave={() => setHoveredNode(null)}
      >
        <span
          role="img"
          tabIndex={0}
          className="connection-route-node"
          data-state={node.state}
          aria-label={nodeAccessibleLabel(node)}
          aria-describedby={inspectedNode === node.index ? tooltipId : undefined}
          onFocus={() => setFocusedNode(node.index)}
          onBlur={() => setFocusedNode(null)}
        ><span className="connection-route-node-mark" aria-hidden="true"/></span>
        {inspectedNode === node.index && <div id={tooltipId} className="connection-route-tooltip" role="tooltip">
          <strong>{node.name}</strong>
          <span className="connection-route-tooltip-detail">
            <span>{nodeDetailLabel(node, progress)}</span>
            <small>{node.endpoint ?? roleDetail(node.role)}</small>
          </span>
        </div>}
      </span>)}
    </div>
    {endpoint && <small className="connection-route-endpoint">{endpoint}</small>}
  </div>;
}

function nodeStateLabel(state: ConnectionRouteNodeState): string {
  if (state === "complete") return "已连接";
  if (state === "active") return "连接中";
  if (state === "failed") return "连接失败";
  return "等待连接";
}

function nodeAccessibleLabel(node: ConnectionRouteNodeProgress): string {
  const endpoint = node.endpoint ? `，${node.endpoint}` : "";
  return `${node.name}：${nodeStateLabel(node.state)}${endpoint}`;
}

function nodeDetailLabel(node: ConnectionRouteNodeProgress, progress: ConnectionRouteProgressState): string {
  if (node.state === "failed") return node.failureMessage ?? progress.message;
  if (progress.phase === "connected") return "已连接";
  if (node.state === "complete") return "已连接";
  if (node.state === "pending") return "等待连接";
  if (node.stage === "verifyHostKey") return "正在校验主机密钥";
  if (node.stage === "authenticate") return "正在认证";
  if (node.stage === "openTunnel") return "正在建立通道";
  if (node.stage === "startSession") return "正在启动会话";
  return "正在连接";
}

function roleDetail(role: ConnectionRouteNodeProgress["role"]): string {
  if (role === "jump") return "SSH 跳板";
  return "目标主机";
}
