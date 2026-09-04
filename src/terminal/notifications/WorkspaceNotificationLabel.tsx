import type { Workspace } from "../../workspace/model";
import { terminalBlockIds } from "../../workspace/layout";
import { useTerminalNotifications } from "./TerminalNotificationProvider";
export function WorkspaceNotificationLabel({ workspace }: { workspace: Workspace }) {
  const notifications = useTerminalNotifications();
  const unread = terminalBlockIds(workspace.layout).some(notifications.unread);
  return <span>{workspace.name}{unread && <span className="workspace-notification-dot" aria-label="有未读终端通知"> ·</span>}</span>;
}
