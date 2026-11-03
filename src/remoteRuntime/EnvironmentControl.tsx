import { useCallback, useEffect, useRef, useState } from "react";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { RuntimeStatusTag } from "./RuntimeStatusTag";
import { Icon } from "../components/Icon";
import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { EnvironmentMenu } from "./EnvironmentMenu";
import { ServerManager } from "./ServerManager";
import { listServers, saveServers, selectedRuntime, selectRuntime } from "./selection";
import type { ServerEntry } from "./model";
import { connectRuntime, disconnectRuntime } from "./transport";
import { flushRuntime, detachRuntime } from "./switchGuard";
import { runRuntimeSwitch } from "./switchOperation";
import "./remoteRuntime.css";

export function EnvironmentControl({status = "本机", onLogout}: {status?: string; onLogout?: () => Promise<void>}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, []);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [entries, setEntries] = useState(listServers);
  const [manager, setManager] = useState<"add" | "manage" | null>(null);
  const [pending, setPending] = useState<{entry: ServerEntry | null} | null>(null);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const closeMenu = useCallback(() => { setAnchor(null); trigger.current?.focus(); }, []);
  function save(entries: ServerEntry[]) { saveServers(entries); setEntries(entries); }
  function requestSwitch(entry: ServerEntry | null) { closeMenu(); setError(""); setPending({entry}); }
  function cancelSwitch() {
    operation.current?.abort(); operation.current = null;
    setPending(null); setBusy(false); setStage(""); setError("");
  }
  async function switchTo(entry: ServerEntry | null) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    let connected = false;
    setBusy(true); setError("");
    try {
      await runRuntimeSwitch([
        { label: "正在保存工作台…", timeoutMessage: "保存工作台超时，请重试", run: flushRuntime },
        { label: "正在退出当前服务器…", timeoutMessage: "退出服务器超时，请重试", run: async () => { if (selectedRuntime) await onLogout?.(); } },
        { label: entry ? "正在连接服务器…" : "正在断开服务器…", timeoutMessage: entry ? "连接服务器超时，请重试" : "断开服务器超时，请重试", run: async () => { if (entry) { await connectRuntime(entry.endpoint); connected = true; } else await disconnectRuntime(); } },
        { label: "正在关闭本机会话…", timeoutMessage: "本机会话未能及时关闭，请重试", run: detachRuntime },
      ], setStage, () => {
        selectRuntime(entry);
        if (entry) save([entry, ...entries.filter(item => item.id !== entry.id)]);
        window.location.reload();
      }, undefined, { signal: controller.signal, onAborted: async () => { if (connected) await disconnectRuntime(); } });
    } catch (reason) {
      if (operation.current === controller) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); setStage(""); }
    }
  }
  return <><div className="runtime-environment-control" role="group" aria-label="运行环境">
    {selectedRuntime && <RuntimeStatusTag entry={selectedRuntime} status={status}/>}
    <ThemedTooltipButton anchorRef={trigger} className="runtime-trigger" tooltip="远程服务器" tooltipDisabled={!!anchor} aria-label={`运行环境：${selectedRuntime?.name ?? "本机"}，${status}`} aria-haspopup="menu" aria-expanded={!!anchor} onClick={() => setAnchor(anchor ? null : trigger.current!.getBoundingClientRect())}><Icon name="server" size={14}/></ThemedTooltipButton>
  </div>
    {anchor && <EnvironmentMenu anchor={anchor} current={selectedRuntime} status={status} servers={entries} onChoose={requestSwitch} onClose={closeMenu} onManage={() => { closeMenu(); setManager("manage"); }}/>} 
    {manager && <ServerManager entries={entries} initialNew={manager === "add"} activeId={selectedRuntime?.id} onSave={save} onClose={() => setManager(null)} onConnect={async entry => { setManager(null); requestSwitch(entry); }}/>} 
    {pending && <DialogFrame compact title={pending.entry ? `连接 ${pending.entry.name}` : "返回本机"} subtitle="切换工作台运行环境" onClose={cancelSwitch}>
      <p className="confirm-copy">{selectedRuntime ? "将断开当前服务器的访问。后台终端任务继续运行；正在进行的文件传输会取消。" : "将保存本机布局，并关闭本机工作台的终端、SSH 会话和网络转发。请先保存文件并完成传输；返回本机后会重新建立会话。"}</p>
      <footer className="dialog-actions dialog-actions-with-status runtime-switch-actions">{busy ? <p className="dialog-action-status runtime-switch-status" role="status">{stage}</p> : <DialogActionStatus message={error}/>}<div><Button variant="danger" onClick={cancelSwitch}>取消</Button><Button className="runtime-switch-submit" variant="primary" loading={busy} onClick={() => void switchTo(pending.entry)}>{busy && <span className="runtime-switch-spinner" aria-hidden="true"/>}{busy ? "切换中…" : pending.entry ? "连接" : "返回本机"}</Button></div></footer>
    </DialogFrame>}
  </>;
}
