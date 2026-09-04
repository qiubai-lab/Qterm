import { focusTerminalBlock } from "../terminal/terminalViewRegistry";
import type { Workspace } from "./model";

export function focusWorkspaceBlock(blockId: string): boolean {
  if (focusTerminalBlock(blockId)) return true;
  const block = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-layout-block]"))
    .find((element) => element.dataset.layoutBlock === blockId);
  block?.focus();
  return Boolean(block);
}

export function findBlockType(workspace: Workspace, blockId: string): "terminal" | "files" | "network" | "git" | null {
  const visit = (node: Workspace["layout"]): "terminal" | "files" | "network" | "git" | null => node.type === "split"
    ? visit(node.first) ?? visit(node.second)
    : node.blockId === blockId ? node.type : null;
  return visit(workspace.layout);
}

