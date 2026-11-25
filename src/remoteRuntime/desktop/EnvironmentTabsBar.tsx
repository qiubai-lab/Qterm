import { useState, type ReactNode } from "react";
import { WorkspaceTabBar, type WorkspaceTabItem } from "../../workspace/WorkspaceTabs";
import { useEnvironments } from "./context";
import type { DesktopEnvironments } from "./environments";
import { WorkspaceSourceDialog } from "./WorkspaceSourceDialog";

function tabKey(environment: string, id: string) { return JSON.stringify([environment, id]); }

export function EnvironmentTabsBar({ host, localLabel }: { host: DesktopEnvironments; localLabel?(id: string): ReactNode }) {
  const { environments, active } = useEnvironments(host);
  const [choosing, setChoosing] = useState(false);
  const tabs = environments.flatMap(env => {
    const items = env.tabs?.items.length ? env.tabs.items : [{ id: "", name: "工作区" }];
    const editable = host.canEdit(env);
    const needsAccess = ["已锁定", "需要登录", "等待接管", "已被接管"].includes(env.status);
    const icon: WorkspaceTabItem["icon"] = env.entry ? needsAccess ? "lockSolid" : "serverSolid" : "workspace";
    return items.map(item => ({
      id: tabKey(env.key, item.id), workspaceId: item.id, env, name: item.name, icon,
      editable, closable: editable && items.length > 1, color: env.entry?.tabColor,
      description: env.closing ? "断开中" : env.entry && env.status !== "已连接" ? env.status : undefined,
      label: env.key === "local" ? localLabel?.(item.id) : <span className="workspace-notification-label" data-unread={item.unread || undefined}
        aria-label={item.unread ? item.name + "，有未读终端通知" : undefined}><span className="workspace-notification-title">{item.name}</span></span>,
    }));
  });
  const lookup = new Map(tabs.map(tab => [tab.id, tab]));
  const owner = host.find(active)!;
  const workspaceIds = (ids: string[]) => ids.map(id => lookup.get(id)!.workspaceId);
  return <><WorkspaceTabBar items={tabs} activeId={tabKey(active, owner.tabs?.activeId ?? "")} disabled={false} limitReached={false} opensDialog
    scope={id => {
      const tab = lookup.get(id);
      const commands = tab && host.commands(tab.env.key);
      if (!tab || !commands) return;
      return {
        items: tabs.filter(item => item.env === tab.env), environment: tab.env.name,
        countSessions: ids => commands.countSessions(workspaceIds(ids)),
        prepareClose: (_, ids) => commands.prepareClose(tab.workspaceId, workspaceIds(ids)),
      };
    }}
    onSelect={id => { const tab = lookup.get(id)!; host.focus(tab.env.key, tab.workspaceId); }}
    onRename={(id, name) => { const tab = lookup.get(id); if (tab) host.commands(tab.env.key)?.rename(tab.workspaceId, name); }}
    onClose={id => {
      const tab = lookup.get(id)!;
      host.focus(tab.env.key);
      host.commands(tab.env.key)?.close(tab.workspaceId);
    }}
    onReorder={(id, target, order) => {
      const tab = lookup.get(id)!;
      const dest = lookup.get(target);
      if (!dest || dest.env !== tab.env) return;
      host.commands(tab.env.key)?.reorder(tab.workspaceId, dest.workspaceId, workspaceIds(order));
      host.focus(tab.env.key, tab.workspaceId);
    }}
    onAdd={() => setChoosing(true)}/>
    {choosing && <WorkspaceSourceDialog host={host} close={() => setChoosing(false)}/>}
  </>;
}
