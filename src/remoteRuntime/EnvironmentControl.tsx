import { useCallback, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { EnvironmentMenu } from "./EnvironmentMenu";
import { ServerManager } from "./ServerManager";
import { listServers, saveServers, selectedRuntime, selectRuntime } from "./selection";
import type { ServerEntry } from "./model";
import { connectRuntime, disconnectRuntime } from "./transport";
import { flushRuntime, detachRuntime } from "./switchGuard";
import "./remoteRuntime.css";

export function EnvironmentControl({status = "本机", onLogout}: {status?: string; onLogout?: () => Promise<void>}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [entries, setEntries] = useState(listServers);
  const [manager, setManager] = useState<"add" | "manage" | null>(null);
  const [pending, setPending] = useState<{entry: ServerEntry | null} | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const closeMenu = useCallback(() => { setAnchor(null); trigger.current?.focus(); }, []);
  function save(entries: ServerEntry[]) { saveServers(entries); setEntries(entries); }
  function requestSwitch(entry: ServerEntry | null) { closeMenu(); setError(""); setPending({entry}); }
  async function switchTo(entry: ServerEntry | null) {
    setBusy(true); setError("");
    try {
      await flushRuntime();
      if (selectedRuntime) await onLogout?.();
      if (entry) await connectRuntime(entry.endpoint); else await disconnectRuntime();
      await detachRuntime();
      selectRuntime(entry);
      if (entry) save([entry, ...entries.filter(item => item.id !== entry.id)]);
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <><button ref={trigger} className="runtime-trigger" data-status={status} aria-label={`运行环境：${selectedRuntime?.name ?? "本机"}，${status}`} aria-haspopup="menu" aria-expanded={!!anchor} onClick={() => setAnchor(anchor ? null : trigger.current!.getBoundingClientRect())}><Icon name={selectedRuntime ? "server" : "computer"} size={14}/><span>{selectedRuntime?.name ?? "本机"}</span>{selectedRuntime && <small>{status}</small>}<Icon name="chevronDown" size={12}/></button>
    {anchor && <EnvironmentMenu anchor={anchor} current={selectedRuntime} status={status} servers={entries} onChoose={requestSwitch} onClose={closeMenu} onAdd={() => { closeMenu(); setManager("add"); }} onManage={() => { closeMenu(); setManager("manage"); }}/>} 
    {manager && <ServerManager entries={entries} initialNew={manager === "add"} activeId={selectedRuntime?.id} onSave={save} onClose={() => setManager(null)} onConnect={async entry => { setManager(null); requestSwitch(entry); }}/>} 
    {pending && <DialogFrame compact title={pending.entry ? `连接 ${pending.entry.name}` : "返回本机"} subtitle="切换工作台运行环境" onClose={() => setPending(null)} dismissible={!busy}>
      <p className="confirm-copy">{selectedRuntime ? "将断开当前服务器的访问。后台终端任务继续运行；正在进行的文件传输会取消。" : "将保存本机布局，并关闭本机工作台的终端、SSH 会话和网络转发。请先保存文件并完成传输；返回本机后会重新建立会话。"}</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={error}/><div><Button variant="danger" disabled={busy} onClick={() => setPending(null)}>取消</Button><Button variant="primary" loading={busy} onClick={() => void switchTo(pending.entry)}>{pending.entry ? "连接" : "返回本机"}</Button></div></footer>
    </DialogFrame>}
  </>;
}
