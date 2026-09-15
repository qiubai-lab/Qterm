import { useAppTheme } from "../app/theme/AppThemeProvider";
import { Button } from "../components/Button";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import type { AppTheme } from "../lib/tauri/settings";

export function DemoToolbar({ onReset, onHelp }: { onReset: () => void; onHelp: () => void }) {
  const { theme, commitTheme } = useAppTheme();
  const { activeBlockId, runtimes, writeBlock } = useWorkspace();
  const ready = runtimes[activeBlockId]?.status === "connected";
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
      <label className="demo-theme-label">主题<select aria-label="演示主题" value={theme} onChange={event => commitTheme(event.target.value as AppTheme)}>
        <option value="dark">深色</option><option value="light">浅色</option><option value="cyberpunk">赛博朋克</option>
      </select></label>
      <Button size="compact" onClick={onHelp}>体验指南</Button>
      <Button size="compact" onClick={() => { commitTheme("dark"); onReset(); }}>重置演示</Button>
    </div>
  </div>;
}
