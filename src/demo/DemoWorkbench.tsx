import { useCallback, useState } from "react";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { WorkspaceCanvas, type ConnectionOwner } from "../workspace/LayoutView";
import { WorkspaceTabs } from "../workspace/WorkspaceTabs";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { CloseRequest } from "../workspace/workspaceClose";
import { DemoToolbar } from "./DemoToolbar";

export function DemoWorkbench({ onReset }: { onReset: () => void }) {
  const { document, activeWorkspace, dispatch, connectBlock, disconnectBlock, closeSessions, storageNotice } = useWorkspace();
  const [help, setHelp] = useState(false);
  const [error, setError] = useState("");
  const connect = useCallback((owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) => {
    if (owner === "terminal") void connectBlock(blockId, profile, { method: "sshAgent" }).catch(reason => setError(String(reason)));
  }, [connectBlock]);
  async function closeBlock(workspaceId: string, blockId: string) {
    await closeSessions([blockId]); dispatch({ type: "closeBlock", workspaceId, blockId });
  }
  async function closeWorkspace(request: CloseRequest) { await closeSessions(request.ids); request.execute(); }

  return <>
    <DemoToolbar onReset={onReset} onHelp={() => setHelp(true)}/>
    <section className="demo-window app-shell" data-platform="macos" aria-label="Qterm 交互演示窗口">
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
                onRequestDisconnect={(_owner, blockId) => void disconnectBlock(blockId)} onRequestAuthConnection={connect}/>
            </div>)}
          </div>
          <aside className="utility-rail" aria-label="功能预览">
            <button className="rail-button" onClick={() => setHelp(true)}><Icon name="help"/><span className="rail-button-label">体验指南</span></button>
            <button className="rail-button" disabled title="文件管理请在桌面版体验"><Icon name="files"/><span className="rail-button-label">文件</span></button>
            <button className="rail-button" disabled title="Git 管理请在桌面版体验"><Icon name="git"/><span className="rail-button-label">Git</span></button>
            <button className="rail-button" disabled title="网络转发请在桌面版体验"><Icon name="network"/><span className="rail-button-label">网络</span></button>
          </aside>
        </div>
      </section>
    </section>
    <p className="demo-caption">模拟环境 · 输入 <code>help</code> 查看命令 · <kbd>Ctrl C</kbd> 停止任务 · 窗口会随浏览器大小自动调整</p>
    {(error || storageNotice) && <p role="alert">{error || storageNotice}</p>}
    {help && <DialogFrame title="体验 Qterm" subtitle="浏览器交互演示" onClose={() => setHelp(false)}>
      <div className="demo-guide">
        <p>从顶部示例开始，或直接在终端输入命令。展开终端右上角菜单即可左右、上下分屏；顶部加号可以新建工作区。</p>
        <ul><li><code>ls</code>、<code>cd src</code>、<code>cat main.ts</code>：浏览预置项目。</li><li><code>npm run build</code>：观察模拟构建过程。</li><li><code>tail -f /home/demo/qterm/logs/app.log</code>：持续日志，Ctrl+C 停止。</li><li>点击终端左上角目标，可以切换两台虚构 SSH 服务器。</li></ul>
        <p>每个终端独立保存目录和历史。主题、搜索、工作区切换和分屏使用真实产品组件。</p>
        <p>本页不连接真实服务器、不运行真实程序，也不需要密码。文件管理、Git 管理、网络转发与凭证管理请下载桌面版体验。刷新或重置会恢复初始演示。</p>
        <a href="https://github.com/qiubai-lab/Qterm/releases/latest" target="_blank" rel="noreferrer">下载 Qterm 桌面版 ↗</a>
      </div>
    </DialogFrame>}
  </>;
}
