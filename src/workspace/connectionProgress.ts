import type { SessionEvent } from "../lib/tauri/sessions";

export interface ConnectionRouteProgressState {
  totalNodes: number;
  completedNodes: number;
  activeNode: number | null;
  phase: "connecting" | "connected";
  message: string;
}

type RouteProgressEvent = Extract<SessionEvent, { type: "routeProgress" }>;

export function initialConnectionProgress(jumpCount: number): ConnectionRouteProgressState {
  return {
    totalNodes: Math.max(2, jumpCount + 2),
    completedNodes: 0,
    activeNode: 1,
    phase: "connecting",
    message: "正在连接节点 1",
  };
}

export function connectionProgressFromRouteEvent(event: RouteProgressEvent): ConnectionRouteProgressState {
  const totalNodes = event.node.total + 1;
  const routeNode = event.node.index + 1;
  const openingNextNode = event.stage === "openTunnel";
  const activeNode = openingNextNode ? Math.min(routeNode + 1, totalNodes - 1) : routeNode;
  const completedNodes = openingNextNode ? activeNode : routeNode;

  return {
    totalNodes,
    completedNodes,
    activeNode,
    phase: "connecting",
    message: routeStageMessage(event),
  };
}

export function completeConnectionProgress(current: ConnectionRouteProgressState | null): ConnectionRouteProgressState | null {
  if (!current) return null;
  return {
    ...current,
    completedNodes: current.totalNodes,
    activeNode: null,
    phase: "connected",
    message: "连接成功",
  };
}

function routeStageMessage(event: RouteProgressEvent): string {
  const number = event.stage === "openTunnel"
    ? Math.min(event.node.index + 2, event.node.total)
    : event.node.index + 1;
  const suffix = event.node.name ? ` · ${event.node.name}` : "";
  if (event.stage === "connect") return `正在连接节点 ${number}${suffix}`;
  if (event.stage === "verifyHostKey") return `正在校验节点 ${number}${suffix}`;
  if (event.stage === "authenticate") return `正在认证节点 ${number}${suffix}`;
  if (event.stage === "openTunnel") return `正在建立节点 ${number} 通道`;
  return `正在启动目标会话${suffix}`;
}
