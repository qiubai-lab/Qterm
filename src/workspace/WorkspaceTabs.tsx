import { MAX_WORKSPACES } from "./workspaceLimits";
import { WorkspaceLimitHint } from "./WorkspaceLimitHint";
import { useWorkspaceTabScroll } from "./useWorkspaceTabScroll";
import { useWorkspaceTabDrag } from "./useWorkspaceTabDrag";
import { useWorkspaceTabDeck } from "./useWorkspaceTabDeck";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { WorkspaceTabStrip, type WorkspaceTabScope } from "./WorkspaceTabStrip";
import { useWorkspace } from "./WorkspaceProvider";
import { createWorkspaceCloseRequest, type CloseRequest } from "./workspaceClose";
import { WorkspaceNotificationLabel } from "../terminal/notifications/WorkspaceNotificationLabel";
import { IconButton } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";

import { useWorkspaceBatchActions } from "./useWorkspaceBatchActions";

export interface WorkspaceTabItem {
  id: string; name: string; label?: ReactNode; icon?: IconName; color?: string | null; description?: string;
  editable: boolean; closable: boolean;
}
interface TabBarProps {
  items: WorkspaceTabItem[]; activeId: string; disabled: boolean; limitReached: boolean;
  scope(id: string): WorkspaceTabScope | undefined;
  onAdd(): void; onSelect(id: string): void; onClose(id: string): void; onRename(id: string, name: string): void;
  onReorder(id: string, target: string, order: string[]): void;
  opensDialog?: boolean;
}
interface Props { disabled: boolean; requestClose: (request: CloseRequest) => void; onReorderSelection: (order: string[]) => void }
export function WorkspaceTabs({ disabled: terminalLocked, requestClose, onReorderSelection }: Props) {
  const { document, activeWorkspace, dispatch } = useWorkspace();
  const actions = useWorkspaceBatchActions();
  const { workspaces } = document;
  return <WorkspaceTabBar items={workspaces.map(item => ({ ...item, editable: true, closable: workspaces.length > 1, label: <WorkspaceNotificationLabel workspace={item}/> }))}
    activeId={activeWorkspace.id} disabled={terminalLocked} limitReached={workspaces.length >= MAX_WORKSPACES}
    scope={() => ({ items: workspaces, ...actions })}
    onAdd={() => dispatch({ type: "addWorkspace" })}
    onSelect={workspaceId => dispatch({ type: "selectWorkspace", workspaceId })}
    onRename={(workspaceId, name) => dispatch({ type: "renameWorkspace", workspaceId, name })}
    onClose={workspaceId => {
      const workspace = workspaces.find(item => item.id === workspaceId);
      if (workspace) requestClose(createWorkspaceCloseRequest(workspace, () => dispatch({ type: "closeWorkspace", workspaceId })));
    }}
    onReorder={(workspaceId, targetWorkspaceId, order) => {
      if (activeWorkspace.id !== workspaceId) onReorderSelection(order);
      dispatch({ type: "reorderWorkspace", workspaceId, targetWorkspaceId });
      if (activeWorkspace.id !== workspaceId) dispatch({ type: "selectWorkspace", workspaceId });
    }}/>;
}

export function WorkspaceTabBar({ items, activeId, disabled: terminalLocked, limitReached, scope, onAdd, onSelect, onRename, onClose, onReorder, opensDialog }: TabBarProps) {
  const [limitHintAnchor, setLimitHintAnchor] = useState<HTMLElement | null>(null);
  const limitHintId = useId();
  const workspaceOrder = items.map(workspace => workspace.id).join("\u0000");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [workspaceTabIndicator, setWorkspaceTabIndicator] = useState({ x: 0, width: 0, ready: false });
  const workspaceTabStripRef = useRef<HTMLDivElement | null>(null);
  const workspaceTabRefs = useRef(new Map<string, HTMLDivElement>());
  const { workspaceDragVisual, workspaceDropSettling, beginWorkspaceDrag, suppressWorkspaceDragClick } = useWorkspaceTabDrag(workspaceTabRefs, id => scope(id)?.items ?? [], onReorder);
  const [menuAnchor, setMenuAnchor] = useState<string | null>(null);
  const ids = useMemo(() => workspaceOrder.split("\u0000"), [workspaceOrder]);
  const deck = useWorkspaceTabDeck({ ids, selectedId: activeId, lockedId: renaming?.id ?? menuAnchor, dragging: Boolean(workspaceDragVisual), strip: workspaceTabStripRef, tabs: workspaceTabRefs });
  const scroll = useWorkspaceTabScroll(workspaceTabStripRef, deck.overflowing);
  useLayoutEffect(() => {
    const strip = workspaceTabStripRef.current;
    const selectedTab = workspaceTabRefs.current.get(activeId);
    if (!strip || !selectedTab) return;

    const positionIndicator = () => {
      if (deck.layout.stacked) return;
      // DOM layout offsets exclude in-flight deck and drag transforms.
      const x = selectedTab.offsetLeft;
      const width = selectedTab.offsetWidth;
      setWorkspaceTabIndicator((current) => current.x === x && current.width === width && current.ready
        ? current
        : { x, width, ready: true });
    };

    positionIndicator();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionIndicator);
    observer?.observe(strip);
    observer?.observe(selectedTab);
    strip.addEventListener("workspace-tab-layout", positionIndicator);
    window.addEventListener("resize", positionIndicator);
    return () => {
      observer?.disconnect();
      strip.removeEventListener("workspace-tab-layout", positionIndicator);
      window.removeEventListener("resize", positionIndicator);
    };
  }, [activeId, workspaceOrder, deck.layout.stacked]);

  useLayoutEffect(() => {
    workspaceTabStripRef.current?.dispatchEvent(new Event("workspace-tab-layout"));
  }, [workspaceDragVisual]);

  function commitRename(name: string) {
    if (!renaming) return;
    // The input is authoritative at submission, even if the rendered draft lags.
    onRename(renaming.id, name);
    setRenaming(null);
  }

  const draggedWorkspaceIndex = workspaceDragVisual
    ? items.findIndex((workspace) => workspace.id === workspaceDragVisual.id)
    : -1;
  const dropTargetWorkspaceIndex = workspaceDragVisual?.targetId
    ? items.findIndex((workspace) => workspace.id === workspaceDragVisual.targetId)
    : -1;

  return <WorkspaceTabStrip scope={scope} data-onboarding="workspaces" {...deck.events} onInteractionAnchorChange={setMenuAnchor} style={{ "--workspace-deck-top": ids.length + 1 } as CSSProperties} data-stacked={deck.layout.stacked || undefined} disabled={terminalLocked} className="workspace-tab-bar" aria-label="工作区">
      {deck.overflowing && <IconButton className="workspace-tab-scroll" size="compact" label="显示左侧工作区" disabled={!scroll.left || terminalLocked} onClick={() => scroll.move(-1)}><Icon name="back" size={13}/></IconButton>}
      <div data-hidden-left={scroll.left || undefined} data-hidden-right={scroll.right || undefined} ref={workspaceTabStripRef} data-stacked={deck.layout.stacked || undefined} className={`workspace-tab-strip${workspaceDragVisual ? " dragging" : ""}${workspaceDropSettling ? " drop-settling" : ""}`}>
        <span
          aria-hidden="true"
          className={`workspace-tab-selection${workspaceTabIndicator.ready ? " ready" : ""}`}
          style={{ width: workspaceTabIndicator.width, transform: `translate3d(${workspaceTabIndicator.x}px, 0, 0)` }}
        />
        {deck.layout.stacked && <span className="workspace-deck-extent" aria-hidden="true" style={{ width: deck.layout.width + 8 }}/> }
        {items.map((workspace, workspaceIndex) => {
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
          const dragStyle = { "--workspace-source-color": workspace.color ?? undefined, "--workspace-tab-drag-x": isDragged ? `${workspaceDragVisual.offsetX}px` : undefined, "--workspace-deck-shift": `${shift}px`, ...(deck.layout.stacked ? { zIndex: isDragged ? ids.length + 1 : workspaceIndex + 1 } : {}) } as CSSProperties;
          return <div ref={(element) => { if (element) workspaceTabRefs.current.set(workspace.id, element); else workspaceTabRefs.current.delete(workspace.id); }} key={workspace.id} data-workspace-id={workspace.id} data-source-color={workspace.color ? true : undefined} data-expanded={card.expanded || undefined} data-drop-shift={dropShift} style={dragStyle} className={`workspace-tab${workspace.id === activeId ? " selected" : ""}${isDragged ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`} onPointerDown={(event) => { if (workspace.editable) beginWorkspaceDrag(event, workspace.id); }}>
          {renaming?.id === workspace.id ? <div className="workspace-tab-rename"><Icon name={workspace.icon ?? "workspace"} size={13}/><input autoFocus aria-label={`重命名 ${workspace.name}`} value={renaming.value} onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} onBlur={(event) => commitRename(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(event.currentTarget.value); if (event.key === "Escape") setRenaming(null); }}/></div>
            : <button className="workspace-tab-select" title={workspace.description ? workspace.name + " · " + workspace.description : workspace.name} aria-description={workspace.description} onClick={(event) => { if (!suppressWorkspaceDragClick(event, workspace.id)) onSelect(workspace.id); }} onDoubleClick={(event) => { if (workspace.editable && !suppressWorkspaceDragClick(event, workspace.id)) setRenaming({ id: workspace.id, value: workspace.name }); }}><Icon name={workspace.icon ?? "workspace"} size={13}/>{workspace.label ?? <span className="workspace-notification-label"><span className="workspace-notification-title">{workspace.name}</span></span>}</button>}
          {workspace.closable && <IconButton className="workspace-tab-close" size="compact" inert={!card.expanded} aria-hidden={!card.expanded} label={`关闭 ${workspace.name}`} onClick={() => onClose(workspace.id)}><Icon name="close" size={12}/></IconButton>}
        </div>})}
      </div>
      {deck.overflowing && <IconButton className="workspace-tab-scroll" size="compact" label="显示右侧工作区" disabled={!scroll.right || terminalLocked} onClick={() => scroll.move(1)}><Icon name="forward" size={13}/></IconButton>}
        <div className="new-workspace-slot" tabIndex={limitReached ? 0 : undefined} aria-label={limitReached ? "新建工作区：已达到数量上限" : undefined} aria-describedby={limitReached ? limitHintId : undefined} onPointerEnter={event => setLimitHintAnchor(event.currentTarget)} onPointerMove={event => { if (limitReached) setLimitHintAnchor(event.currentTarget); }} onPointerLeave={() => setLimitHintAnchor(null)} onFocus={event => setLimitHintAnchor(event.currentTarget)} onBlur={() => setLimitHintAnchor(null)}><IconButton disabled={limitReached} aria-describedby={limitReached ? limitHintId : undefined} className="new-workspace-tab" size="compact" label="新建工作区" aria-haspopup={opensDialog ? "dialog" : undefined} onClick={onAdd}><Icon name="plus" size={14}/></IconButton></div>
      {limitReached && <WorkspaceLimitHint anchor={limitHintAnchor} id={limitHintId}/> }
      </WorkspaceTabStrip>;
}

