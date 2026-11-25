import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useEnvironmentForeground } from "../remoteRuntime/desktop/useEnvironmentForeground";
import { WorkspaceCanvas } from "./LayoutView";
import type { Workspace } from "./model";

type Canvas = ComponentProps<typeof WorkspaceCanvas>;
type Actions = Pick<Canvas, "onRequestClose" | "onRequestDisconnect" | "onRequestAuthConnection" | "onOpenConnectionManager">;
type Props = Actions & Pick<Canvas, "remoteShellIntegrationEnabled" | "terminalSettingsReady"> & {
  workspaces: Workspace[]; activeId: string; hydrated: boolean; covered: boolean; attentionId: string | null;
  transition: { workspaceId: string; direction: "forward" | "backward" | null };
  renderRuntime?: (workspaceId: string, visible: boolean) => ReactNode;
};

const CanvasView = memo(WorkspaceCanvas);

export function WorkspaceStages(props: Props) {
  const { workspaces, activeId, hydrated, covered, transition, renderRuntime } = props;
  const foreground = useEnvironmentForeground();
  const [mounted, setMounted] = useState<ReadonlySet<string>>(() => new Set());
  // A direct selection always wins over background warm-up. Keep visited views resident.
  const showActive = hydrated && foreground && !covered;
  const retained = workspaces.filter(w => mounted.has(w.id) || (showActive && w.id === activeId));
  if (retained.length !== mounted.size || retained.some(w => !mounted.has(w.id))) {
    setMounted(new Set(retained.map(w => w.id)));
  }
  const next = workspaces.find(workspace => !mounted.has(workspace.id) && !(showActive && workspace.id === activeId));
  useEffect(() => {
    if (!hydrated || covered || !next) return;
    const warm = () => setMounted(previous => new Set(previous).add(next.id));
    const timer = window.setTimeout(warm, foreground ? 120 : 400);
    return () => window.clearTimeout(timer);
  }, [covered, foreground, hydrated, next]);

  const handlers = useRef<Actions>(props);
  useLayoutEffect(() => { handlers.current = props; });
  const actions = useMemo<Actions>(() => ({
    onRequestClose: id => handlers.current.onRequestClose(id),
    onRequestDisconnect: (...args) => handlers.current.onRequestDisconnect?.(...args),
    onRequestAuthConnection: (...args) => handlers.current.onRequestAuthConnection(...args),
    onOpenConnectionManager: () => handlers.current.onOpenConnectionManager?.(),
  }), []);

  return <div className="workspace-canvases">{workspaces.map(workspace => {
    const selected = workspace.id === activeId;
    const visible = selected && foreground && !covered;
    const direction = visible && transition.workspaceId === workspace.id ? transition.direction : null;
    return <div key={workspace.id} className={`workspace-canvas-stage${selected ? " visible" : ""}${direction ? ` workspace-transition-${direction}` : ""}`} aria-hidden={!selected}>
      {(mounted.has(workspace.id) || (showActive && selected)) && <>
        <CanvasView {...actions} workspace={workspace} visible={visible} localTerminalAttention={workspace.id === props.attentionId}
          remoteShellIntegrationEnabled={props.remoteShellIntegrationEnabled} terminalSettingsReady={props.terminalSettingsReady}/>
        {renderRuntime?.(workspace.id, visible)}
      </>}
    </div>;
  })}</div>;
}
