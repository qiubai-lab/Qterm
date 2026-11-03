import { useState } from "react";
import { Icon } from "../components/Icon";
import { OverlayScrollArea } from "../components/scrollbars/OverlayScrollArea";
import { Button } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";
import { ServerEntryRow } from "./ServerEntryRow";
import { useServerManagerMotion } from "./useServerManagerMotion";
import { serverEntry, type ServerEntry } from "./model";
interface Props { entries: ServerEntry[]; initialNew: boolean; activeId?: string; onSave: (entries: ServerEntry[]) => void; onConnect: (entry: ServerEntry) => Promise<void>; onClose: () => void }
export function ServerManager({entries, initialNew, activeId, onSave, onConnect, onClose}: Props) {
  const [selected, setSelected] = useState<ServerEntry | null>(initialNew ? null : entries[0] ?? null);
  const {listRef, stageRef, target, indicator, select} = useServerManagerMotion(selected?.id ?? null, entries);
  const [name, setName] = useState(selected?.name ?? "");
  const [endpoint, setEndpoint] = useState(selected?.endpoint ?? "");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  function choose(entry: ServerEntry | null) { select(entry?.id ?? null, () => { setSelected(entry); setName(entry?.name ?? ""); setEndpoint(entry?.endpoint ?? ""); setError(""); }); }
  function save(): ServerEntry {
    const entry = serverEntry(name, endpoint, selected?.id);
    if (entries.some(item => item.id !== entry.id && item.endpoint === entry.endpoint)) throw new Error("这个服务器地址已经保存");
    onSave([entry, ...entries.filter(item => item.id !== entry.id)]); select(entry.id, () => { setSelected(entry); setName(entry.name); setEndpoint(entry.endpoint); }); return entry;
  }
  async function submit(connect: boolean) {
    setBusy(true); setError("");
    try { const entry = save(); if (connect) await onConnect(entry); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <><DialogFrame wide title="服务器管理" titleIcon={<Icon name="server" size={16}/>} subtitle="连接远程工作台" headerActions={<span className="runtime-manager-count">{entries.length} 台服务器</span>} onClose={onClose} dismissible={!busy && !deleting} className="runtime-manager">
    <div className="runtime-manager-grid">
      <aside className="runtime-manager-sidebar">
        <div className="runtime-sidebar-heading"><span>服务器</span><span>{entries.length.toString().padStart(2, "0")}</span></div>
        <Button size="compact" variant="secondary" className="runtime-add-server" onClick={() => choose(null)} disabled={busy}><Icon name="plus" size={13}/>添加服务器</Button>
        <OverlayScrollArea ref={listRef} className="runtime-server-scroll" viewportClassName="runtime-server-list" viewportProps={{"aria-label":"已保存的服务器"}} density="compact">
          {indicator && <span className="runtime-selection" aria-hidden="true" style={{height:indicator.height,transform:`translateY(${indicator.top}px)`}}/>}
          {entries.length ? entries.map(entry => <ServerEntryRow key={entry.id} entry={entry} selected={target === entry.id} active={entry.id === activeId} busy={busy} onChoose={() => choose(entry)}/>) : <div className="runtime-list-empty"><Icon name="server" size={20}/><strong>尚未添加服务器</strong><span>保存常用地址，快速切换</span></div>}
        </OverlayScrollArea>
        <div className="runtime-sidebar-foot"><Icon name="computer" size={12}/><span>地址仅保存在此设备</span></div>
      </aside>
      <form className="runtime-server-editor" onSubmit={event => { event.preventDefault(); void submit(true); }}>
        <OverlayScrollArea className="runtime-editor-scroll" viewportClassName="runtime-editor-viewport" density="compact">
          <div ref={stageRef} className="runtime-server-fields">
            <div className="runtime-editor-heading"><span className="runtime-editor-icon"><Icon name={selected ? "server" : "plus"} size={18}/></span><div><h3>{selected ? selected.name : "新服务器"}</h3><p>{selected?.id === activeId ? "正在使用此运行环境" : "配置地址，连接后登录"}</p></div>{selected?.id === activeId && <span className="runtime-current-label">当前环境</span>}</div>
            <section className="runtime-form-section" aria-label="连接配置"><h4>连接配置</h4><div className="runtime-form-rows">
              <label className="runtime-form-row"><span><RequiredFieldLabel>服务器地址</RequiredFieldLabel><small>HTTP / HTTPS</small></span><input required data-dialog-autofocus aria-label="服务器地址" placeholder="https://qterm.example.com" value={endpoint} onChange={event => setEndpoint(event.target.value)} disabled={busy || Boolean(selected && selected.id === activeId)}/></label>
              <label className="runtime-form-row"><span>显示名称<small>可选，便于识别</small></span><input aria-label="显示名称" maxLength={80} placeholder="例如：开发服务器" value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
            </div></section>
            <section className="runtime-form-section" aria-label="访问与运行"><h4>访问与运行</h4><div className="runtime-details">
              <div><Icon name="key" size={14}/><span><strong>连接后验证身份</strong><small>登录密码不会保存在服务器列表中</small></span></div>
              <div><Icon name="terminal" size={14}/><span><strong>任务在服务器执行</strong><small>终端、文件与网络转发使用远程环境</small></span></div>
            </div></section>
            <p className="runtime-transport-note" data-insecure={endpoint.trim().startsWith("http://") || undefined}><Icon name={endpoint.trim().startsWith("http://") ? "alertCircle" : "lock"} size={12}/>{endpoint.trim().startsWith("http://") ? "HTTP 未加密，仅用于可信网络" : "建议使用 HTTPS 加密连接"}</p>
          </div>
        </OverlayScrollArea>
        <footer className="runtime-editor-footer"><DialogActionStatus message={error}/><div>{selected && <Button size="compact" variant="danger" disabled={busy || selected.id === activeId} onClick={() => setDeleting(true)}><Icon name="trash" size={12}/>删除</Button>}<span className="runtime-action-spacer"/><Button size="compact" disabled={busy} onClick={() => void submit(false)}>保存</Button><Button size="compact" type="submit" variant="primary" loading={busy} disabled={Boolean(selected && selected.id === activeId)}><Icon name="network" size={13}/>连接</Button></div></footer>
      </form>
    </div>
  </DialogFrame>{deleting && <DialogFrame compact title="删除服务器记录" subtitle={selected?.name} onClose={() => setDeleting(false)}><p className="confirm-copy">仅删除这台电脑保存的服务器地址，不删除服务器上的配置或任务。</p><footer className="dialog-actions"><Button onClick={() => setDeleting(false)}>取消</Button><Button variant="danger" onClick={() => { onSave(entries.filter(entry => entry.id !== selected?.id)); choose(null); setDeleting(false); }}>删除记录</Button></footer></DialogFrame>}</>;
}
