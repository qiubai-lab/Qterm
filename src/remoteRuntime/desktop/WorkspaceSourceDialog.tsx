import type { CSSProperties } from "react";
import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { Icon } from "../../components/Icon";
import { MAX_WORKSPACES } from "../../workspace/workspaceLimits";
import { useEnvironments } from "./context";
import type { DesktopEnvironments } from "./environments";

export function WorkspaceSourceDialog({ host, close }: { host: DesktopEnvironments; close(): void }) {
  const { environments, active } = useEnvironments(host);
  const options = environments.map(env => {
    const full = (env.tabs?.items.length ?? 0) >= MAX_WORKSPACES;
    const available = host.canEdit(env);
    const enabled = available && !full;
    const connection = env.entry ? env.status : available ? "可用" : "暂不可用";
    const status = env.closing ? "断开中" : full && available ? "已达上限" : connection;
    return { env, enabled, status };
  });
  const preferred = options.find(item => item.enabled && item.env.key === active) ?? options.find(item => item.enabled);
  return <DialogFrame compact environment={null} title="选择工作区来源" onClose={close} className="workspace-source-dialog" scrimClassName="workspace-source-scrim">
    <div className="workspace-source-options" onKeyDown={event => {
      const keys = ["ArrowUp", "ArrowDown", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const choices = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
      choices[next]?.focus();
    }}>
      {options.map(({ env, enabled, status }) => <button type="button" key={env.key} disabled={!enabled}
        data-dialog-autofocus={env === preferred?.env ? true : undefined}
        style={{ "--source-icon-color": env.entry?.tabColor ?? undefined } as CSSProperties}
        onClick={() => { close(); host.create(env.key); }}>
        <span className="workspace-source-icon"><Icon name={env.entry ? "server" : "computer"} size={18}/></span>
        <span className="workspace-source-identity"><strong>{env.name}</strong><small>{env.entry?.endpoint ?? "当前设备"}</small></span>
        <span className="workspace-source-status"><i aria-hidden="true"/>{status}</span>
      </button>)}
    </div>
  </DialogFrame>;
}
