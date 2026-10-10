import { useState } from "react";
import { writeText } from "@qterm/services/textClipboard";
import { getTerminalActivity } from "./terminalActivityRegistry";
import { useTerminalActivity } from "./useTerminalActivity";

export function TerminalCommandMenuItems({ sessionKey, close }: { sessionKey: string; close: () => void }) {
  const { commands } = useTerminalActivity(sessionKey);
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const navigate = (direction: "previous" | "next") => { getTerminalActivity(sessionKey)?.navigate(direction); close(); };
  async function copyOutput() {
    const text = getTerminalActivity(sessionKey)?.output();
    if (!text) { setMessage("输出已移出缓冲区、为空或不可完整复制"); return; }
    setCopying(true);
    try { await writeText(text); close(); }
    catch { setMessage("复制失败，请重试"); }
    finally { setCopying(false); }
  }
  return <>
    <div className="terminal-context-menu-separator" role="separator"/>
    <button role="menuitem" disabled={!commands.previous} onClick={() => navigate("previous")}><span>上一条命令</span></button>
    <button role="menuitem" disabled={!commands.next} onClick={() => navigate("next")}><span>下一条命令</span></button>
    <button role="menuitem" disabled={!commands.canCopy || copying} onClick={() => void copyOutput()}><span>{copying ? "正在复制…" : "复制命令输出"}</span></button>
    <p className="terminal-command-feedback" role="status">{message || (commands.count === 0 ? "启用 Shell 集成后可按命令导航" : commands.selected === null ? "导航到命令后可复制其完整输出" : `命令 ${commands.selected}${commands.exitCode === null ? "" : ` · 退出码 ${commands.exitCode}`}`)}</p>
  </>;
}
