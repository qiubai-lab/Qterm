import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { ServerManager } from "../ServerManager";
import { EnvironmentMenu } from "../EnvironmentMenu";
import { listServers, saveServers } from "../selection";
import type { ServerEntry } from "../model";
import { useEnvironments } from "./context";
import { serverKey, type DesktopEnvironments } from "./environments";
import "../remoteRuntime.css";

export function DesktopControl({host}: {host: DesktopEnvironments}) {
  const { environments, active } = useEnvironments(host);
  const [entries, setEntries] = useState(listServers);
  const [anchor, setAnchor] = useState<{ trigger: HTMLButtonElement; bounds: DOMRect } | null>(null);
  const [manager, setManager] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const env = host.find(active)!;
  const target = pending ? host.find(pending) : null;
  const transfers = target ? host.transferCount(target.key) : 0;
  const ask = (key: string) => { setAnchor(null); if (!host.find(key)?.closing) { setFailure(null); setPending(key); } };
  function choose(entry: ServerEntry) {
    setAnchor(null);
    void host.connect(entry);
  }
  async function disconnect() {
    if (!target) return;
    setPending(null);
    try { await host.disconnect(target.key); }
    catch (reason) { setFailure({ key: target.key, message: `${target.name}：${reason instanceof Error ? reason.message : String(reason)}` }); }
  }
  return <div className="runtime-environment-control" role="group" aria-label="运行环境">
    {environments.length > 1 && <button aria-label="访问记录" disabled={!env.entry || env.status !== "已连接"} className="runtime-trigger runtime-log-trigger" onClick={() => host.showLog(active)}><Icon name="history" size={14}/></button>}
    <button aria-label={`运行环境：${env.name}，${env.status}`} aria-haspopup="menu" aria-expanded={!!anchor} className="runtime-trigger"
      onClick={event => setAnchor(anchor ? null : { trigger: event.currentTarget, bounds: event.currentTarget.getBoundingClientRect() })}><Icon name="server" size={14}/></button>
    {anchor && <EnvironmentMenu trigger={anchor.trigger} anchor={anchor.bounds} current={env.entry ?? null} status={env.status} servers={entries} onChoose={choose}
      connected={environments.filter(item => item.entry).map(item => ({entry: item.entry!, status: item.closing ? "断开中" : item.status}))}
      onDisconnect={id => ask(serverKey(id))} onManage={() => { setAnchor(null); setManager(true); }} onClose={() => setAnchor(null)}/>}
    {manager && <ServerManager initialNew={!entries.length} entries={entries} activeId={env.entry?.id} connectedIds={environments.flatMap(item => item.entry ? [item.entry.id] : [])}
      onSave={next => { saveServers(next); setEntries(next); host.renameEntries(next); }} onConnect={async entry => { setManager(false); choose(entry); }} onClose={() => setManager(false)}/>}
    {failure && <div role="alert" data-app-overlay="floating" className="global-notice">
      <span>{failure.message}</span><button onClick={() => ask(failure.key)}>重试</button>
      <button aria-label="关闭提示" onClick={() => setFailure(null)}><Icon name="close" size={12}/></button>
    </div>}
    {target && <DialogFrame compact environment={null} title={`断开 ${target.name}？`} subtitle={target.entry?.endpoint} dismissible={!target.closing} onClose={() => { if (!target.closing) setPending(null); }}>
      <p className="confirm-copy">该服务器的工作区将从标签栏移除，下次连接时恢复。服务器上的终端任务继续运行。</p>
      {transfers > 0 && <p className="callout">{transfers} 个进行中的文件传输将取消。</p>}
      <footer className="dialog-actions dialog-actions-with-status runtime-switch-actions"><div><Button variant="danger" disabled={target.closing} onClick={() => setPending(null)}>取消</Button><Button variant="primary" loading={target.closing} onClick={() => void disconnect()}>断开连接</Button></div></footer>
    </DialogFrame>}
  </div>;
}
