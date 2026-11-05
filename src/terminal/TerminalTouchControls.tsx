import { writeText } from "@qterm/services/textClipboard";
import { TerminalTouchSelection } from "./TerminalTouchSelection";
import { terminalSelectionText } from "./terminalSelectionText";
import { useState, type RefObject } from "react";
import { useBrowserInterface } from "../browser/browserInterfaceContext";
import type { TerminalView } from "./terminalView";
import "./terminalTouchControls.css";

const keys = [["Esc", "\x1b"], ["Tab", "\t"], ["Ctrl+C", "\x03"], ["Ctrl+D", "\x04"], ["Ctrl+Z", "\x1a"], ["Ctrl+L", "\x0c"]] as const;
const arrows = [["↑", "上方向键", "A"], ["↓", "下方向键", "B"], ["←", "左方向键", "D"], ["→", "右方向键", "C"]] as const;

/** Sends through the same ordered input and guarded paste paths as the keyboard. */
export function TerminalTouchControls({ viewRef, enabled, paste }: { viewRef: RefObject<TerminalView | null>; enabled: boolean; paste: () => Promise<void> }) {
  const { showKeybar } = useBrowserInterface();
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  if (!showKeybar) return null;
  const send = async (data: string) => {
    if (!enabled) return;
    const view = viewRef.current;
    if (!view) return;
    setError("");
    view.terminal.focus();
    try { await view.inputScheduler.send(data); } catch { setError("输入未发送，请等待连接恢复后重试。"); }
  };
  const copySelection = async () => {
    const terminal = viewRef.current?.terminal;
    if (!terminal?.hasSelection()) { setError("请先点击选择，选取要复制的文字。");return; }
    setError("");
    try { await writeText(terminal.getSelection()); }
    catch { setError("无法写入剪贴板，请使用选择窗口中的系统复制菜单。"); }
  };
  const pasteClipboard = async () => {
    setError("");
    try { await paste(); } catch { setError("无法读取剪贴板，请使用系统粘贴。"); }
  };
  return <div className="terminal-touch-controls">
    <div className="terminal-touch-keybar" role="group" aria-label="终端快捷键" onPointerDown={event => { event.preventDefault(); }}>
      {keys.map(([label, data]) => <button key={label} disabled={!enabled} onClick={() => void send(data)}>{label}</button>)}
      {arrows.map(([label, name, suffix]) => <button key={name} aria-label={name} disabled={!enabled} onClick={() => void send(`\x1b${viewRef.current?.terminal.modes?.applicationCursorKeysMode ? "O" : "["}${suffix}`)}>{label}</button>)}
      <button onClick={() => viewRef.current?.terminal.focus()}>键盘</button>
      <button onClick={() => { if (viewRef.current) setSelection(terminalSelectionText(viewRef.current.terminal)); }}>选择</button>
      <button onClick={() => void copySelection()}>复制</button>
      <button disabled={!enabled} onClick={() => void pasteClipboard()}>粘贴</button>
    </div>
    {selection !== null && <TerminalTouchSelection text={selection} onClose={() => setSelection(null)}/>}
    {error && <div className="terminal-touch-error" role="alert">{error}</div>}
  </div>;
}
