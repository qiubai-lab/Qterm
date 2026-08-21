import type { SessionEvent, SessionRouteStage } from "../lib/tauri/sessions";

export type ConnectionRouteNodeState = "pending" | "active" | "complete" | "failed";

export interface ConnectionRouteNodeProgress {
  index: number;
  name: string;
  endpoint: string | null;
  role: "jump" | "target";
  state: ConnectionRouteNodeState;
  stage: SessionRouteStage | null;
  failureMessage?: string;
}

export interface ConnectionRouteProgressState {
  totalNodes: number;
  completedNodes: number;
  activeNode: number | null;
  phase: "connecting" | "connected" | "failed";
  message: string;
  nodes: ConnectionRouteNodeProgress[];
}

type RouteProgressEvent = Extract<SessionEvent, { type: "routeProgress" }>;

export function initialConnectionProgress(jumpCount: number): ConnectionRouteProgressState {
  const totalNodes = Math.max(1, jumpCount + 1);
  return {
    totalNodes,
    completedNodes: 0,
    activeNode: 0,
    phase: "connecting",
    message: "正在连接节点 1",
    nodes: createRouteNodes(totalNodes),
  };
}

export function connectionProgressFromRouteEvent(event: RouteProgressEvent, current?: ConnectionRouteProgressState | null): ConnectionRouteProgressState {
  const totalNodes = Math.max(1, event.node.total);
  const routeNode = event.node.index;
  const openingNextNode = event.stage === "openTunnel";
  const activeNode = openingNextNode ? Math.min(routeNode + 1, totalNodes - 1) : routeNode;
  const completedNodes = openingNextNode ? activeNode : routeNode;
  const baseNodes = current?.nodes.length === totalNodes ? current.nodes : createRouteNodes(totalNodes);
  const nodes = baseNodes.map((node) => ({
    ...node,
    state: node.index < completedNodes ? "complete" as const : node.index === activeNode ? "active" as const : "pending" as const,
  }));
  nodes[routeNode] = {
    ...nodes[routeNode],
    name: event.node.name || nodes[routeNode].name,
    endpoint: `${event.node.host}:${event.node.port}`,
    role: event.node.role,
    stage: event.stage,
  };
  if (openingNextNode && activeNode !== routeNode) nodes[activeNode] = { ...nodes[activeNode], stage: event.stage };

  return {
    totalNodes,
    completedNodes,
    activeNode,
    phase: "connecting",
    message: routeStageMessage(event),
    nodes,
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
    nodes: current.nodes.map((node) => ({ ...node, state: "complete" })),
  };
}

export function failConnectionProgress(current: ConnectionRouteProgressState | null, node: RouteProgressEvent["node"] | null, message: string): ConnectionRouteProgressState | null {
  if (!current) return null;
  const fallbackIndex = current.activeNode ?? Math.min(current.completedNodes, current.nodes.length - 1);
  const failedIndex = Math.max(0, Math.min(node?.index ?? fallbackIndex, current.nodes.length - 1));
  return {
    ...current,
    activeNode: null,
    phase: "failed",
    message,
    nodes: current.nodes.map((item) => item.index === failedIndex ? {
      ...item,
      ...(node ? { name: node.name || item.name, endpoint: `${node.host}:${node.port}`, role: node.role } : {}),
      state: "failed",
      failureMessage: message,
    } : item),
  };
}

function createRouteNodes(totalNodes: number): ConnectionRouteNodeProgress[] {
  return Array.from({ length: totalNodes }, (_, index) => {
    if (index === totalNodes - 1) return { index, name: "目标节点", endpoint: null, role: "target", state: index === 0 ? "active" : "pending", stage: index === 0 ? "connect" : null };
    return { index, name: `跳板 ${index + 1}`, endpoint: null, role: "jump", state: index === 0 ? "active" : "pending", stage: index === 0 ? "connect" : null };
  });
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
