import { useRef } from "react";
import type { Workspace } from "../../workspace/model";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { terminalBlockIds } from "../../workspace/layout";
import { focusTerminalBlock } from "../terminalViewRegistry";
import { useTerminalNotifications } from "./TerminalNotificationProvider";
import { WorkspaceNotificationBubble } from "./WorkspaceNotificationBubble";

export function WorkspaceNotificationLabel({ workspace }: { workspace: Workspace }) {
  const notifications = useTerminalNotifications();
  const { dispatch, getTerminalEpoch } = useWorkspace();
  const anchor = useRef<HTMLSpanElement>(null);
  const unread = terminalBlockIds(workspace.layout).some(notifications.unread);
  const notice = notifications.notice?.workspaceId === workspace.id ? notifications.notice : null;
  const activate = () => {
    if (!notice) return;
    notifications.dismissNotice(notice.revision);
    dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
    requestAnimationFrame(() => { if (getTerminalEpoch(notice.blockId) === notice.epoch) focusTerminalBlock(notice.blockId); });
  };
  return <span ref={anchor} className="workspace-notification-label" data-unread={unread || undefined} aria-label={unread ? `${workspace.name}，有未读终端通知` : undefined}><span className="workspace-notification-title">{workspace.name}</span>
    {notice && <WorkspaceNotificationBubble notice={notice} name={workspace.name} showBody={notifications.showBody} anchor={anchor} dismiss={notifications.dismissNotice} activate={activate}/>}
  </span>;
}
