import { useCallback, useEffect, useRef, useState, type ComponentPropsWithRef } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { WorkspaceTabMenu } from "./WorkspaceTabMenu";
import { WorkspaceBatchCloseDialog } from "./WorkspaceBatchCloseDialog";
import { workspaceCloseLabels, workspaceCloseTargets, type WorkspaceCloseSide } from "./workspaceClose";

interface CloseBatch { anchorId: string; ids: string[]; side: WorkspaceCloseSide }
export function WorkspaceTabStrip({ disabled, onInteractionAnchorChange, ...props }: ComponentPropsWithRef<"nav"> & { disabled: boolean; onInteractionAnchorChange?: (id: string | null) => void }) {
  const { document: state, dispatch, blocksForWorkspace, closeSessions, connectedCount } = useWorkspace();
  const [menu, setMenu] = useState<{ anchorId: string; x: number; y: number } | null>(null);
  const [request, setRequest] = useState<CloseBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const interactionAnchor = menu?.anchorId ?? request?.anchorId ?? null;
  useEffect(() => { onInteractionAnchorChange?.(interactionAnchor); }, [interactionAnchor, onInteractionAnchorChange]);
  const busyRef = useRef(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback((restore = true) => { setMenu(null); if (restore) anchor.current?.focus(); }, []);
  const exists = (id: string) => state.workspaces.some(item => item.id === id);
  if (menu && (disabled || !exists(menu.anchorId))) setMenu(null);
  if (request && !busy && (disabled || !exists(request.anchorId))) setRequest(null);
  const targets = request ? state.workspaces.filter(item => request.ids.includes(item.id) && item.id !== request.anchorId) : [];
  const open = (target: EventTarget, x: number, y: number) => {
    if (disabled || request || document.querySelector('[role="dialog"]')) return;
    if (!(target instanceof Element) || target.closest("input")) return;
    const tab = target.closest<HTMLElement>(".workspace-tab[data-workspace-id]");
    if (!tab || !exists(tab.dataset.workspaceId!)) return;
    anchor.current = tab.querySelector(".workspace-tab-select");
    setMenu({ anchorId: tab.dataset.workspaceId!, x, y });
  };
  const choose = (side: WorkspaceCloseSide) => {
    if (!menu) return;
    const ids = workspaceCloseTargets(state.workspaces, menu.anchorId, side).map(item => item.id);
    if (!ids.length) return;
    closeMenu(); setError(""); setRequest({ anchorId: menu.anchorId, ids, side });
  };
  const confirm = async () => {
    if (!request || busyRef.current || !exists(request.anchorId) || !targets.length) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const ids = Array.from(new Set(targets.flatMap(blocksForWorkspace)));
      await closeSessions(ids);
      dispatch({ type: "closeWorkspaces", workspaceIds: targets.map(item => item.id), anchorId: request.anchorId });
      setRequest(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "部分会话未能关闭，请重试。工作区布局已保留。");
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <nav {...props} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); open(event.target, event.clientX, event.clientY); }}
    onKeyDown={event => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault(); event.stopPropagation();
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      open(event.target, rect.left, rect.bottom + 4);
    }}>
    {props.children}
    {menu && <WorkspaceTabMenu {...menu} workspaces={state.workspaces} onChoose={choose} onDismiss={closeMenu}/>}
    {request && <WorkspaceBatchCloseDialog title={workspaceCloseLabels[request.side]} targets={targets} sessions={connectedCount(targets.flatMap(blocksForWorkspace))} busy={busy} error={error} onCancel={() => { if (!busyRef.current) setRequest(null); }} onConfirm={() => void confirm()}/>}
  </nav>;
}
