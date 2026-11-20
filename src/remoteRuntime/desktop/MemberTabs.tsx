import { focusWorkspaceBlock } from "../../workspace/workspaceFocus";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { terminalBlockIds } from "../../workspace/layout";
import { useTerminalNotifications } from "../../terminal/notifications/TerminalNotificationProvider";
import { createWorkspaceCloseRequest, type CloseRequest } from "../../workspace/workspaceClose";
import { WorkspaceNotificationLabel } from "../../terminal/notifications/WorkspaceNotificationLabel";
import { useWorkspaceBatchActions } from "../../workspace/useWorkspaceBatchActions";
import { WorkspaceTabs } from "../../workspace/WorkspaceTabs";
import { framePort, type WorkspaceCommands, type WorkspacePort } from "./frame";
import { useDesktopHost, useEnvironments } from "./context";
import type { DesktopEnvironments } from "./environments";
import { EnvironmentTabsBar } from "./EnvironmentTabsBar";

type Props = { disabled: boolean; requestClose(request: CloseRequest): void; onReorderSelection(order: string[]): void };
function PublishTabs({ port, disabled, requestClose, onReorderSelection }: Props & { port: WorkspacePort }) {
  const { document, hydrated, dispatch } = useWorkspace();
  const notifications = useTerminalNotifications();
  const batch = useWorkspaceBatchActions();
  const latest = useRef({ document, disabled, requestClose, onReorderSelection, batch });
  useLayoutEffect(() => { latest.current = { document, disabled, requestClose, onReorderSelection, batch }; });
  const commands = useMemo<WorkspaceCommands>(() => ({
    create: () => dispatch({ type: "addWorkspace" }),
    select: id => {
      dispatch({ type: "selectWorkspace", workspaceId: id });
      requestAnimationFrame(() => {
        const state = latest.current.document;
        const selected = state.workspaces.find(item => item.id === state.activeWorkspaceId);
        if (selected?.id === id && !window.document.querySelector('[role="dialog"],[role="menu"]')) focusWorkspaceBlock(selected.activeBlockId);
      });
    },
    rename: (id, name) => dispatch({ type: "renameWorkspace", workspaceId: id, name }),
    reorder: (id, target, order) => {
      if (latest.current.document.activeWorkspaceId !== id) latest.current.onReorderSelection(order);
      dispatch({ type: "reorderWorkspace", workspaceId: id, targetWorkspaceId: target });
    },
    countSessions: ids => latest.current.batch.countSessions(ids),
    prepareClose: (anchor, ids) => latest.current.batch.prepareClose(anchor, ids),
    close: id => {
      const current = latest.current;
      const workspace = current.document.workspaces.find(item => item.id === id);
      if (!current.disabled && workspace && current.document.workspaces.length > 1)
        current.requestClose(createWorkspaceCloseRequest(workspace, () => dispatch({ type: "closeWorkspace", workspaceId: id })));
    },
  }), [dispatch]);
  const signature = JSON.stringify(document.workspaces.map(({ id, name, layout }) => ({ id, name, unread: terminalBlockIds(layout).some(notifications.unread) })));
  useLayoutEffect(() => {
    if (hydrated) return port.publish({ activeId: document.activeWorkspaceId, items: JSON.parse(signature), enabled: !disabled }, commands);
  }, [commands, disabled, document.activeWorkspaceId, hydrated, port, signature]);
  return null;
}
function LocalTabs({ host, ...props }: Props & { host: DesktopEnvironments }) {
  const { environments } = useEnvironments(host);
  const { document } = useWorkspace();
  const port = useMemo(() => host.workspacePort("local"), [host]);
  return <><PublishTabs {...props} port={port}/>{environments.length === 1 ? <WorkspaceTabs {...props}/> : <EnvironmentTabsBar host={host} localLabel={id => {
    const workspace = document.workspaces.find(item => item.id === id);
    return workspace && <WorkspaceNotificationLabel workspace={workspace}/>;
  }}/>}</>;
}
export function MemberTabs(props: Props) {
  const host = useDesktopHost();
  if (framePort) return <PublishTabs {...props} port={framePort}/>;
  return host ? <LocalTabs {...props} host={host}/> : <WorkspaceTabs {...props}/>;
}
