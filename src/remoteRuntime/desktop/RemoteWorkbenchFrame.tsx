import { useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { WorkspaceUtilityRail } from "../../workspace/WorkspaceUtilityRail";
import type { DesktopEnvironment, DesktopEnvironments } from "./environments";
import type { RuntimeFrame } from "./frame";

export function RemoteWorkbenchFrame({ host, env, visible, shortcut }: {
  host: DesktopEnvironments; env: DesktopEnvironment; visible: boolean;
  shortcut(host: DesktopEnvironments, event: KeyboardEvent): void;
}) {
  const frame = useRef<RuntimeFrame>(null);
  const { key, apiBase } = env;
  const gated = env.status !== "已连接";
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element || !apiBase) return;
    element.qtermWorkbench = host.frame(host.find(key)!, event => shortcut(host, event));
    // Keep the same bundled document attached when the rail and access panel change.
    element.src = new URL("index.html", window.location.href).href;
    return () => { delete element.qtermWorkbench; };
  }, [apiBase, host, key, shortcut]);
  useEffect(() => { if (visible) frame.current?.focus(); }, [visible, apiBase]);

  return <section className="remote-workbench-frame workspace-stage-content" data-gated={gated || undefined} hidden={!visible} inert={!visible || env.closing} aria-label={env.name + " 工作区"}>
    <div className="remote-frame-canvas">
      <div className={gated ? "terminal-block active" : "remote-workbench-ready"}>
        {gated && <header className="terminal-block-header remote-access-header"><Icon name="server" size={14}/><strong>{env.name}</strong><span>{env.entry?.endpoint}</span></header>}
        {apiBase ? <iframe ref={frame} className="environment-frame" aria-label={env.name + " 工作台"}/> :
          <div className="environment-startup"><p role="status">{env.error ?? "正在连接服务器…"}</p>
            {env.error && <Button onClick={() => void host.connect(env.entry!)}>重试</Button>}
          </div>}
      </div>
    </div>
    {gated && <WorkspaceUtilityRail unavailableTitle={env.status}/>}
  </section>;
}
