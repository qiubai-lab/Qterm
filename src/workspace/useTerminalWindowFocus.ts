import { useEffect, useEffectEvent } from "react";
import { subscribeWindowActivation } from "../lib/tauri/windowActivation";
import { focusTerminalBlock } from "../terminal/terminalViewRegistry";
import { findLeaf } from "./layout";
import type { Workspace } from "./model";
import { isEditableOutsideTerminal } from "./useWorkspaceShortcuts";

export function useTerminalWindowFocus(workspace: Workspace, enabled: boolean) {
  const restore = useEffectEvent(() => {
    if (!enabled || document.hidden || findLeaf(workspace.layout, workspace.activeBlockId)?.type !== "terminal") return;
    if (isEditableOutsideTerminal(document.activeElement) || document.querySelector('[role="dialog"], [role="menu"]')) return;
    focusTerminalBlock(workspace.activeBlockId);
  });

  useEffect(() => subscribeWindowActivation(() => restore()), []);
}
