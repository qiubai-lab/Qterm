import { useAppTheme } from "../app/theme/AppThemeProvider";
import { Button } from "../components/Button";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import type { AppTheme } from "../lib/tauri/settings";
import { blockIds, findLeaf } from "../workspace/layout";

export function DemoToolbar({ onReset, onHelp, onConnections }: { onReset: () => void; onHelp: () => void; onConnections: () => void }) {
  const { theme, commitTheme } = useAppTheme();
  const { activeBlockId, activeWorkspace, dispatch, runtimes, writeBlock } = useWorkspace();
  const ready = runtimes[activeBlockId]?.status === "connected";
  const blocks = blockIds(activeWorkspace.layout).map(id => findLeaf(activeWorkspace.layout, id)!).filter(Boolean);
  async function run(command: string) {
    await writeBlock(activeBlockId, new TextEncoder().encode(`\x03${command}\r`));
    document.querySelector<HTMLElement>(`[data-layout-block="${activeBlockId}"] .xterm-helper-textarea`)?.focus();
  }
  return <div className="demo-toolbar">
    <div className="demo-samples" role="group" aria-label="示例命令">
      <span>试一试</span>
      <Button size="compact" disabled={!ready} onClick={() => void run("npm run build")}>构建项目</Button>
      <Button size="compact" disabled={!ready} onClick={() => void run("tail -f /home/demo/qterm/logs/app.log")}>实时日志</Button>
      <Button size="compact" disabled={!ready} onClick={() => void run("git status")}>Git 状态</Button>
    </div>
    <div className="demo-preferences">
      <label className="demo-block-switch">视图<select aria-label="手机视图" value={activeBlockId} onChange={event => dispatch({ type: "selectBlock", workspaceId: activeWorkspace.id, blockId: event.target.value })}>{blocks.map((block, index) => <option key={block.blockId} value={block.blockId}>{block.type === "terminal" ? "终端" : block.type === "files" ? "文件" : block.type === "git" ? "Git" : "网络"} {index + 1}</option>)}</select></label>
      <label className="demo-theme-label">主题<select aria-label="演示主题" value={theme} onChange={event => commitTheme(event.target.value as AppTheme)}>
        <option value="dark">深色</option><option value="light">浅色</option><option value="cyberpunk">赛博朋克</option>
      </select></label>
      <Button size="compact" onClick={onHelp}>体验指南</Button>
      <Button size="compact" onClick={onConnections}>演示连接</Button>
      <Button size="compact" onClick={() => { commitTheme("dark"); onReset(); }}>重置演示</Button>
    </div>
  </div>;
}
