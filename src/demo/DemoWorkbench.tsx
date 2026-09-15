import { OnboardingRestart } from "../onboarding/OnboardingRestart";
import { WorkspaceUtilityRail } from "../workspace/WorkspaceUtilityRail";
import { useCallback, useState } from "react";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { WorkspaceCanvas, type ConnectionOwner } from "../workspace/LayoutView";
import { WorkspaceTabs } from "../workspace/WorkspaceTabs";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { CloseRequest } from "../workspace/workspaceClose";
import { useAppTheme } from "../app/theme/AppThemeProvider";
import { DemoToolbar } from "./DemoToolbar";
import { openFileWindowAction } from "../workspace/fileWindow";
import { openGitWindowAction } from "../workspace/gitWindow";
import { openNetworkWindowAction } from "../workspace/networkWindow";

export function DemoWorkbench() {
  const { theme } = useAppTheme();
  const { document, activeWorkspace, dispatch, connectBlock, connectFileBlock, connectGitBlock, connectNetworkBlock, disconnectBlock, disconnectFileBlock, disconnectGitBlock, disconnectNetworkBlock, closeSessions, storageNotice, profiles, runtimes, splitTerminalBlock } = useWorkspace();
  const [connections, setConnections] = useState(false);
  const [error, setError] = useState("");
  const connect = useCallback((owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => {
    const action = { terminal: connectBlock, files: connectFileBlock, git: connectGitBlock, network: connectNetworkBlock }[owner];
    void action(blockId, profile, { method: "sshAgent" }).catch(reason => setError(String(reason)));
  }, [connectBlock, connectFileBlock, connectGitBlock, connectNetworkBlock]);
  async function closeBlock(workspaceId: string, blockId: string) {
    await closeSessions([blockId]); dispatch({ type: "closeBlock", workspaceId, blockId });
  }
  async function closeWorkspace(request: CloseRequest) { await closeSessions(request.ids); request.execute(); }

  return <>
    <DemoToolbar/>
    <section data-platform="macos" data-demo-theme={theme} className="demo-window app-shell" aria-label="Qterm 交互演示窗口">
      <header className="app-chrome">
        <div className="demo-traffic-lights" aria-hidden="true"><span/><span/><span/></div>
        <div className="app-brand"><Icon name="terminal"/><span>Qterm</span></div>
        <WorkspaceTabs disabled={false} requestClose={request => void closeWorkspace(request)} onReorderSelection={() => undefined}/>
      </header>
      <section className="workspace-stage">
        <div className="workspace-stage-content">
          <div className="workspaces">
            {document.workspaces.map(workspace => <div key={workspace.id} className="workspace-panel" hidden={workspace.id !== activeWorkspace.id}>
              <WorkspaceCanvas workspace={workspace} visible={workspace.id === activeWorkspace.id} remoteShellIntegrationEnabled
                onRequestClose={blockId => void closeBlock(workspace.id, blockId)}
                onOpenConnectionManager={() => setConnections(true)}
                onRequestDisconnect={(owner, blockId) => void ({ terminal: disconnectBlock, files: disconnectFileBlock, git: disconnectGitBlock, network: disconnectNetworkBlock }[owner])(blockId)} onRequestAuthConnection={connect}/>
            </div>)}
          </div>
          <WorkspaceUtilityRail unavailableTitle="暂未开放演示" controls={{
            files: { onClick: () => dispatch(openFileWindowAction(activeWorkspace, runtimes, true)) },
            network: { onClick: () => dispatch(openNetworkWindowAction(activeWorkspace)) },
            git: { onClick: () => dispatch(openGitWindowAction(activeWorkspace, runtimes)) },
            terminal: { onClick: () => splitTerminalBlock(activeWorkspace.id, activeWorkspace.activeBlockId, "horizontal", true) },
          }}/>
        </div>
      </section>
    </section>
    <footer className="demo-footer"><p className="demo-caption">模拟环境 · 输入 <code>help</code> 查看命令 · <kbd>Ctrl C</kbd> 停止任务</p><span data-demo-theme={theme}><OnboardingRestart/></span></footer>
    {(error || storageNotice) && <p role="alert">{error || storageNotice}</p>}
    {connections && <DialogFrame title="演示连接" subtitle="仅展示虚构目标，选择目标请使用 Block 左上角" onClose={() => setConnections(false)}><div className="demo-guide"><p>本页不连接真实服务器，也不需要密码或私钥。打开终端左上角的目标菜单可以在以下目标间切换。</p><ul>{profiles.map(profile => <li key={profile.id}><strong>{profile.name}</strong> · <code>{profile.username}@{profile.host}:{profile.port}</code></li>)}</ul></div></DialogFrame>}
  </>;
}
