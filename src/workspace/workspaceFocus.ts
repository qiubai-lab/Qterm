import { framePort } from "../remoteRuntime/desktop/frame";
import { environmentForeground } from "../remoteRuntime/desktop/foreground";
import { focusTerminalBlock } from "../terminal/terminalViewRegistry";
import type { Workspace } from "./model";

export function focusWorkspaceBlock(blockId: string): boolean {
  if (!environmentForeground()) return false;
  // A remote terminal can receive a delayed selection callback during a titlebar double click.
  const chromeDocument = framePort ? window.parent.document : document;
  if (chromeDocument.activeElement?.matches(".workspace-tab-rename input")) return false;
  if (focusTerminalBlock(blockId)) return true;
  const block = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-layout-block]"))
    .find((element) => element.dataset.layoutBlock === blockId);
  // A native guest focus event selects its block while the main document is blurred.
  // Focusing the shell here would steal the first click/keystroke from that guest.
  if (block?.classList.contains("web-block") &&
    (!globalThis.document.hasFocus() || block.contains(globalThis.document.activeElement))) return true;
  block?.focus();
  return Boolean(block);
}

export function findBlockType(workspace: Workspace, blockId: string): "terminal" | "files" | "network" | "git" | "web" | null {
  const visit = (node: Workspace["layout"]): "terminal" | "files" | "network" | "git" | "web" | null => node.type === "split"
    ? visit(node.first) ?? visit(node.second)
    : node.blockId === blockId ? node.type : null;
  return visit(workspace.layout);
}

