import { useCallback, useEffect, useRef, useState, type ComponentPropsWithRef } from "react";
import { WorkspaceTabMenu } from "./WorkspaceTabMenu";
import { WorkspaceBatchCloseDialog } from "./WorkspaceBatchCloseDialog";
import { workspaceCloseLabels, workspaceCloseTargets, type WorkspaceCloseSide } from "./workspaceClose";
import type { WorkspaceBatchActions } from "./useWorkspaceBatchActions";

export interface WorkspaceTabScope extends WorkspaceBatchActions {
  items: { id: string }[];
  environment?: string;
}
interface CloseBatch { anchorId: string; ids: string[]; side: WorkspaceCloseSide }
type StripProps = ComponentPropsWithRef<"nav"> & { disabled: boolean; onInteractionAnchorChange?: (id: string | null) => void };
export function WorkspaceTabStrip({ disabled, scope, onInteractionAnchorChange, ...props }: StripProps & { scope(id: string): WorkspaceTabScope | undefined }) {
  const [menu, setMenu] = useState<{ anchorId: string; x: number; y: number } | null>(null);
  const [request, setRequest] = useState<CloseBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const interactionAnchor = menu?.anchorId ?? request?.anchorId ?? null;
  useEffect(() => { onInteractionAnchorChange?.(interactionAnchor); }, [interactionAnchor, onInteractionAnchorChange]);
  const busyRef = useRef(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback((restore = true) => { setMenu(null); if (restore) anchor.current?.focus(); }, []);
  const exists = (id: string) => scope(id)?.items.some(item => item.id === id);
  if (menu && (disabled || !exists(menu.anchorId))) setMenu(null);
  if (request && !busy && (disabled || !exists(request.anchorId))) setRequest(null);
  const owner = request ? scope(request.anchorId) : undefined;
  const targets = request && owner ? owner.items.filter(item => request.ids.includes(item.id) && item.id !== request.anchorId) : [];
  const open = (target: EventTarget, x: number, y: number) => {
    if (disabled || request || document.querySelector('[aria-modal="true"]')) return;
    if (!(target instanceof Element) || target.closest("input")) return;
    const tab = target.closest<HTMLElement>(".workspace-tab[data-workspace-id]");
    if (!tab || !exists(tab.dataset.workspaceId!)) return;
    anchor.current = tab.querySelector(".workspace-tab-select");
    setMenu({ anchorId: tab.dataset.workspaceId!, x, y });
  };
  const choose = (side: WorkspaceCloseSide) => {
    if (!menu) return;
    const ids = workspaceCloseTargets(scope(menu.anchorId)?.items ?? [], menu.anchorId, side).map(item => item.id);
    if (!ids.length) return;
    closeMenu(); setError(""); setRequest({ anchorId: menu.anchorId, ids, side });
  };
  const confirm = async () => {
    if (!request || !owner || busyRef.current || !exists(request.anchorId) || !targets.length) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const finish = await owner.prepareClose(request.anchorId, targets.map(item => item.id));
      return () => {
        finish();
        setRequest(null);
      };
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
    {menu && <WorkspaceTabMenu {...menu} workspaces={scope(menu.anchorId)?.items ?? []} onChoose={choose} onDismiss={closeMenu}/>}
    {request && owner && <WorkspaceBatchCloseDialog environment={owner.environment} title={workspaceCloseLabels[request.side]} count={targets.length} sessions={owner.countSessions(targets.map(item => item.id))} busy={busy} error={error} onCancel={() => { if (!busyRef.current) setRequest(null); }} onConfirm={confirm}/>}
  </nav>;
}
