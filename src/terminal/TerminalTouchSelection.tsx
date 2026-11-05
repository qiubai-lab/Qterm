import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { writeText } from "@qterm/services/textClipboard";
import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";

export function TerminalTouchSelection({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  async function copy() {
    const field = ref.current;
    if (!field) return;
    const selection = text.slice(field.selectionStart, field.selectionEnd);
    if (!selection) { setCopied(false);setMessage("请长按选择文字，或先点击全选。");return; }
    try { await writeText(selection);setCopied(true);setMessage("已复制所选文字"); }
    catch { setCopied(false);setMessage("无法写入剪贴板，请使用系统复制菜单。"); }
  }
  return createPortal(<DialogFrame title="选择终端文字" subtitle="当前内容快照，最多保留最近约 1 MiB 文字" wide onClose={onClose}>
    <textarea data-native-text-selection ref={ref} className="terminal-touch-selection" aria-label="终端文字快照" readOnly value={text} spellCheck={false}/>
    <footer className="dialog-actions dialog-actions-with-status">
      {copied ? <p role="status">{message}</p> : <DialogActionStatus message={message}/>}
      <div><Button onClick={() => ref.current?.select()}>全选</Button><Button variant="primary" onClick={() => void copy()}>复制所选文字</Button></div>
    </footer>
  </DialogFrame>, document.body);
}
