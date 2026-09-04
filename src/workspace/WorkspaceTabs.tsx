import { useWorkspaceTabDrag } from "./useWorkspaceTabDrag";
import { useWorkspaceTabDeck } from "./useWorkspaceTabDeck";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";
import { useWorkspace } from "./WorkspaceProvider";
import { createWorkspaceCloseRequest, type CloseRequest } from "./workspaceClose";
import { WorkspaceNotificationLabel } from "../terminal/notifications/WorkspaceNotificationLabel";
import { IconButton } from "../components/Button";
import { Icon } from "../components/Icon";
import { currentDesktopPlatform } from "../lib/tauri/window";
import { shortcutLabel } from "../app/shortcuts";

interface Props { disabled: boolean; requestClose: (request: CloseRequest) => void; onReorderSelection: (order: string[]) => void }
export function WorkspaceTabs({ disabled: terminalLocked, requestClose, onReorderSelection }: Props) {
  const { document, activeWorkspace, dispatch } = useWorkspace();
  const desktopPlatform = currentDesktopPlatform();
  const workspaceOrder = document.workspaces.map(workspace => workspace.id).join("\u0000");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [workspaceTabIndicator, setWorkspaceTabIndicator] = useState({ x: 0, width: 0, ready: false });
  const workspaceTabStripRef = useRef<HTMLElement | null>(null);
  const workspaceTabRefs = useRef(new Map<string, HTMLDivElement>());
  const { workspaceDragVisual, workspaceDropSettling, beginWorkspaceDrag, suppressWorkspaceDragClick } = useWorkspaceTabDrag(workspaceTabRefs, onReorderSelection);
  const [menuAnchor, setMenuAnchor] = useState<string | null>(null);
  const ids = useMemo(() => workspaceOrder.split("\u0000"), [workspaceOrder]);
  const deck = useWorkspaceTabDeck({ ids, selectedId: activeWorkspace.id, lockedId: renaming?.id ?? menuAnchor, dragging: Boolean(workspaceDragVisual), strip: workspaceTabStripRef, tabs: workspaceTabRefs });
  useLayoutEffect(() => {
    const strip = workspaceTabStripRef.current;
    const selectedTab = workspaceTabRefs.current.get(activeWorkspace.id);
    if (!strip || !selectedTab) return;

    const positionIndicator = () => {
      const stripRect = strip.getBoundingClientRect();
      const tabRect = selectedTab.getBoundingClientRect();
      const x = tabRect.left - stripRect.left + strip.scrollLeft;
      setWorkspaceTabIndicator((current) => current.x === x && current.width === tabRect.width && current.ready
        ? current
        : { x, width: tabRect.width, ready: true });
    };

    positionIndicator();
    window.addEventListener("resize", positionIndicator);
    return () => window.removeEventListener("resize", positionIndicator);
  }, [activeWorkspace.id, workspaceOrder, deck.layout.stacked]);

  useLayoutEffect(() => {
    workspaceTabStripRef.current?.dispatchEvent(new Event("workspace-tab-layout"));
  }, [workspaceDragVisual]);

  function commitRename() {
    if (!renaming) return;
    dispatch({ type: "renameWorkspace", workspaceId: renaming.id, name: renaming.value });
    setRenaming(null);
  }

  const draggedWorkspaceIndex = workspaceDragVisual
    ? document.workspaces.findIndex((workspace) => workspace.id === workspaceDragVisual.id)
    : -1;
  const dropTargetWorkspaceIndex = workspaceDragVisual?.targetId
    ? document.workspaces.findIndex((workspace) => workspace.id === workspaceDragVisual.targetId)
    : -1;

  return <WorkspaceTabStrip {...deck.events} onInteractionAnchorChange={setMenuAnchor} style={{ "--workspace-deck-top": ids.length + 1 } as CSSProperties} data-stacked={deck.layout.stacked || undefined} disabled={terminalLocked} ref={workspaceTabStripRef} className={`workspace-tab-strip${workspaceDragVisual ? " dragging" : ""}${workspaceDropSettling ? " drop-settling" : ""}`} aria-label="工作区">
        <span
          aria-hidden="true"
          className={`workspace-tab-selection${workspaceTabIndicator.ready ? " ready" : ""}`}
          style={{ width: workspaceTabIndicator.width, transform: `translate3d(${workspaceTabIndicator.x}px, 0, 0)` }}
        />
        {deck.layout.stacked && <span className="workspace-deck-extent" aria-hidden="true" style={{ width: deck.layout.width }}/> }
        {document.workspaces.map((workspace, workspaceIndex) => {
          const card = deck.layout.cards[workspaceIndex];
          const isDragged = workspaceDragVisual?.id === workspace.id;
          const isDropTarget = workspaceDragVisual?.targetId === workspace.id;
          const dropShift = draggedWorkspaceIndex >= 0 && dropTargetWorkspaceIndex > draggedWorkspaceIndex
            && workspaceIndex > draggedWorkspaceIndex && workspaceIndex <= dropTargetWorkspaceIndex
            ? "left"
            : draggedWorkspaceIndex >= 0 && dropTargetWorkspaceIndex >= 0 && dropTargetWorkspaceIndex < draggedWorkspaceIndex
              && workspaceIndex >= dropTargetWorkspaceIndex && workspaceIndex < draggedWorkspaceIndex
              ? "right"
              : undefined;
          const shift = dropShift === "left" ? -(deck.layout.cards[draggedWorkspaceIndex]?.width + 3) : dropShift === "right" ? deck.layout.cards[draggedWorkspaceIndex]?.width + 3 : 0;
          const dragStyle = { "--workspace-tab-drag-x": isDragged ? `${workspaceDragVisual.offsetX}px` : undefined, "--workspace-deck-shift": `${shift}px`, ...(deck.layout.stacked ? { zIndex: isDragged ? ids.length + 1 : workspaceIndex + 1 } : {}) } as CSSProperties;
          return <div ref={(element) => { if (element) workspaceTabRefs.current.set(workspace.id, element); else workspaceTabRefs.current.delete(workspace.id); }} key={workspace.id} data-workspace-id={workspace.id} data-expanded={card.expanded || undefined} data-drop-shift={dropShift} style={dragStyle} className={`workspace-tab${workspace.id === activeWorkspace.id ? " selected" : ""}${isDragged ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`} onPointerDown={(event) => beginWorkspaceDrag(event, workspace.id)}>
          {renaming?.id === workspace.id ? <div className="workspace-tab-rename"><Icon name="workspace" size={13}/><input autoFocus aria-label={`重命名 ${workspace.name}`} value={renaming.value} onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") setRenaming(null); }}/></div>
            : <button className="workspace-tab-select" title={workspace.name} onClick={(event) => { if (!suppressWorkspaceDragClick(event, workspace.id)) dispatch({ type: "selectWorkspace", workspaceId: workspace.id }); }} onDoubleClick={(event) => { if (!suppressWorkspaceDragClick(event, workspace.id)) setRenaming({ id: workspace.id, value: workspace.name }); }}><Icon name="workspace" size={13}/><WorkspaceNotificationLabel workspace={workspace}/></button>}
          {document.workspaces.length > 1 && card.expanded && <IconButton className="workspace-tab-close" size="compact" label={`关闭 ${workspace.name}`} onClick={() => requestClose(createWorkspaceCloseRequest(workspace, () => dispatch({ type: "closeWorkspace", workspaceId: workspace.id })))}><Icon name="close" size={12}/></IconButton>}
        </div>})}
        <div className="new-workspace-slot"><IconButton className="new-workspace-tab" size="compact" label="新建工作区" title={`新建工作区 (${shortcutLabel("newWorkspace", desktopPlatform)})`} onClick={() => dispatch({ type: "addWorkspace" })}><Icon name="plus" size={14}/></IconButton></div>
      </WorkspaceTabStrip>;
}

