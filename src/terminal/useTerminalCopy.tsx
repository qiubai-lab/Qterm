import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { writeText } from "@qterm/services/textClipboard";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Button } from "../components/Button";
import type { TerminalView } from "./terminalView";

export function useTerminalCopy(viewRef: RefObject<TerminalView | null>, sessionKey: string, closeMenu: (restore?: boolean) => void, restoreFocus: () => void) {
  const [manual, setManual] = useState<{ text: string; key: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [sessionKey]);
  const copy = useCallback(async () => {
    const view = viewRef.current;
    if (!view?.terminal.hasSelection()) return;
    const text = view.terminal.getSelection();
    const request = ++generation.current;
    try {
      await writeText(text);
      if (request === generation.current) { setManual(null); closeMenu(); }
    } catch {
      if (request !== generation.current || viewRef.current !== view) return;
      closeMenu(false);
      setManual({ text, key: sessionKey });
    }
  }, [viewRef, sessionKey, closeMenu]);
  const close = () => { setManual(null); restoreFocus(); };
  const dialog = manual?.key === sessionKey ? createPortal(
    <DialogFrame compact title="手动复制" subtitle="浏览器未允许直接复制，请在下方使用系统复制操作" onClose={close}>
      <textarea className="terminal-copy-text" aria-label="待复制的终端文本" readOnly value={manual.text} data-dialog-autofocus onFocus={event => event.currentTarget.select()}/>
      <p className="confirm-copy">文本已选中，按 Ctrl+C（Mac 为 ⌘C），或使用浏览器菜单中的“复制”。</p>
      <footer className="dialog-actions end"><Button onClick={close}>关闭</Button></footer>
    </DialogFrame>, document.body) : null;
  return { copy, dialog };
}
