import type { CSSProperties, KeyboardEvent } from "react";
import { useAppTheme } from "../app/theme/AppThemeProvider";
import { useWorkspace } from "../workspace/WorkspaceProvider";
import type { AppTheme } from "../lib/tauri/settings";
import { blockIds, findLeaf } from "../workspace/layout";

const themes: { value: AppTheme; label: string }[] = [
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
  { value: "cyberpunk", label: "赛博" },
];

export function DemoToolbar() {
  const { theme, commitTheme } = useAppTheme();
  const { activeBlockId, activeWorkspace, dispatch } = useWorkspace();
  const blocks = blockIds(activeWorkspace.layout).map(id => findLeaf(activeWorkspace.layout, id)!).filter(Boolean);
  const selected = themes.findIndex(option => option.value === theme);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2
      : ["ArrowRight", "ArrowDown"].includes(event.key) ? (index + 1) % 3
        : ["ArrowLeft", "ArrowUp"].includes(event.key) ? (index + 2) % 3 : null;
    if (next === null) return;
    event.preventDefault();
    commitTheme(themes[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next].focus();
  }
  return <div className="demo-toolbar">
    <div className="demo-themes" role="radiogroup" aria-label="演示主题" style={{ "--theme-index": selected } as CSSProperties}>
      <span className="demo-theme-indicator" aria-hidden="true"/>
      {themes.map((option, index) => <button key={option.value} type="button" role="radio"
        aria-checked={theme === option.value} tabIndex={theme === option.value ? 0 : -1}
        onClick={() => commitTheme(option.value)} onKeyDown={event => navigate(event, index)}>
        <span className="demo-theme-swatch" data-theme={option.value} aria-hidden="true"/>{option.label}
      </button>)}
    </div>
    <select className="demo-block-switch" aria-label="手机视图" value={activeBlockId}
      onChange={event => dispatch({ type: "selectBlock", workspaceId: activeWorkspace.id, blockId: event.target.value })}>
      {blocks.map((block, index) => <option key={block.blockId} value={block.blockId}>{block.type === "terminal" ? "终端" : block.type === "files" ? "文件" : block.type === "git" ? "Git" : "网络"} {index + 1}</option>)}
    </select>
  </div>;
}
