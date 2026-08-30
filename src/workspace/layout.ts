import type { LayoutLeaf, LayoutNode, SplitDirection, TerminalNode } from "./model";

export type DropPosition = "left" | "right" | "top" | "bottom" | "center";

export function blockIds(node: LayoutNode): string[] {
  return node.type !== "split"
    ? [node.blockId]
    : [...blockIds(node.first), ...blockIds(node.second)];
}

export function findTerminal(node: LayoutNode, blockId: string): TerminalNode | null {
  if (node.type !== "split") return node.type === "terminal" && node.blockId === blockId ? node : null;
  return findTerminal(node.first, blockId) ?? findTerminal(node.second, blockId);
}

export function splitTerminal(
  node: LayoutNode,
  targetId: string,
  direction: SplitDirection,
  terminal: LayoutLeaf,
  splitId: string,
  before = false,
): LayoutNode {
  if (node.type !== "split") {
    if (node.blockId !== targetId) return node;
    return {
      type: "split",
      id: splitId,
      direction,
      ratio: 0.5,
      first: before ? terminal : node,
      second: before ? node : terminal,
    };
  }
  return {
    ...node,
    first: splitTerminal(node.first, targetId, direction, terminal, splitId, before),
    second: splitTerminal(node.second, targetId, direction, terminal, splitId, before),
  };
}

export function closeTerminal(node: LayoutNode, blockId: string): LayoutNode | null {
  if (node.type !== "split") return node.blockId === blockId ? null : node;
  const first = closeTerminal(node.first, blockId);
  const second = closeTerminal(node.second, blockId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function updateSplitRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type !== "split") return node;
  if (node.id === splitId) return { ...node, ratio: Math.min(0.85, Math.max(0.15, ratio)) };
  return {
    ...node,
    first: updateSplitRatio(node.first, splitId, ratio),
    second: updateSplitRatio(node.second, splitId, ratio),
  };
}

export function setTerminalProfile(node: LayoutNode, blockId: string, profileId: string | null): LayoutNode {
  if (node.type !== "split") {
    if (node.type !== "terminal" || node.blockId !== blockId || node.profileId === profileId) return node;
    return { ...node, profileId, restoreDirectory: null };
  }
  return mapSplit(node, (child) => setTerminalProfile(child, blockId, profileId));
}

export function setTerminalRestoreDirectory(node: LayoutNode, blockId: string, profileId: string | null, restoreDirectory: string | null): LayoutNode {
  if (node.type !== "split") {
    if (node.type !== "terminal" || node.blockId !== blockId || node.profileId !== profileId || node.restoreDirectory === restoreDirectory) return node;
    return { ...node, restoreDirectory };
  }
  return mapSplit(node, (child) => setTerminalRestoreDirectory(child, blockId, profileId, restoreDirectory));
}

export function clearTerminalRestoreDirectories(node: LayoutNode): LayoutNode {
  if (node.type !== "split") return node.type === "terminal" && node.restoreDirectory !== null ? { ...node, restoreDirectory: null } : node;
  return mapSplit(node, clearTerminalRestoreDirectories);
}

export function moveTerminal(
  node: LayoutNode,
  sourceId: string,
  targetId: string,
  position: DropPosition,
  splitId: string,
): LayoutNode {
  if (sourceId === targetId) return node;
  const source = findLeaf(node, sourceId);
  const target = findLeaf(node, targetId);
  if (!source || !target) return node;
  if (position === "center") return swapTerminals(node, sourceId, targetId, source, target);
  const detached = closeTerminal(node, sourceId);
  if (!detached) return node;
  const direction: SplitDirection = position === "left" || position === "right" ? "horizontal" : "vertical";
  const before = position === "left" || position === "top";
  return splitTerminal(detached, targetId, direction, source, splitId, before);
}

function swapTerminals(
  node: LayoutNode,
  sourceId: string,
  targetId: string,
  source: LayoutLeaf,
  target: LayoutLeaf,
): LayoutNode {
  if (node.type !== "split") {
    if (node.blockId === sourceId) return target;
    if (node.blockId === targetId) return source;
    return node;
  }
  return {
    ...node,
    first: swapTerminals(node.first, sourceId, targetId, source, target),
    second: swapTerminals(node.second, sourceId, targetId, source, target),
  };
}

export function terminalBlockIds(node: LayoutNode): string[] {
  if (node.type === "terminal") return [node.blockId];
  if (node.type === "files" || node.type === "network") return [];
  return [...terminalBlockIds(node.first), ...terminalBlockIds(node.second)];
}

export function setFilesPath(node: LayoutNode, blockId: string, path: string): LayoutNode {
  if (node.type !== "split") return node.type === "files" && node.blockId === blockId ? { ...node, path } : node;
  return {
    ...node,
    first: setFilesPath(node.first, blockId, path),
    second: setFilesPath(node.second, blockId, path),
  };
}

export function setFilesProfile(node: LayoutNode, blockId: string, profileId: string | null): LayoutNode {
  if (node.type !== "split") return node.type === "files" && node.blockId === blockId ? { ...node, profileId } : node;
  return {
    ...node,
    first: setFilesProfile(node.first, blockId, profileId),
    second: setFilesProfile(node.second, blockId, profileId),
  };
}

export function setNetworkProfile(node: LayoutNode, blockId: string, profileId: string | null): LayoutNode {
  if (node.type !== "split") return node.type === "network" && node.blockId === blockId ? { ...node, profileId } : node;
  return {
    ...node,
    first: setNetworkProfile(node.first, blockId, profileId),
    second: setNetworkProfile(node.second, blockId, profileId),
  };
}

export function findLeaf(node: LayoutNode, blockId: string): LayoutLeaf | null {
  if (node.type !== "split") return node.blockId === blockId ? node : null;
  return findLeaf(node.first, blockId) ?? findLeaf(node.second, blockId);
}

function mapSplit(node: Extract<LayoutNode, { type: "split" }>, update: (child: LayoutNode) => LayoutNode): LayoutNode {
  const first = update(node.first);
  const second = update(node.second);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}
