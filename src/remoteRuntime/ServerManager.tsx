import { useState } from "react";
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
  return <><DialogFrame wide title="服务器管理" subtitle="管理整个工作台的运行环境；SSH 连接在各环境内独立管理" onClose={onClose} dismissible={!busy && !deleting} className="runtime-manager">
    <div className="runtime-manager-grid"><aside><Button onClick={() => choose(null)} disabled={busy}>添加服务器</Button><div ref={listRef} className="runtime-server-list" aria-label="已保存的服务器">{indicator && <span className="runtime-selection" aria-hidden="true" style={{height:indicator.height,transform:`translateY(${indicator.top}px)`}}/>}{entries.length ? entries.map(entry => <ServerEntryRow key={entry.id} entry={entry} selected={target === entry.id} active={entry.id === activeId} busy={busy} onChoose={() => choose(entry)}/>) : <p>尚未保存服务器</p>}</div></aside>
      <form className="runtime-server-editor" onSubmit={event => { event.preventDefault(); void submit(true); }}>
        <div ref={stageRef} className="runtime-server-fields"><h3>{selected ? "服务器设置" : "连接新服务器"}</h3>
          <label><RequiredFieldLabel>服务器地址</RequiredFieldLabel><input required data-dialog-autofocus aria-label="服务器地址" placeholder="https://qterm.example.com" value={endpoint} onChange={event => setEndpoint(event.target.value)} disabled={busy || Boolean(selected && selected.id === activeId)}/></label>
          <label>显示名称（可选）<input aria-label="显示名称" maxLength={80} placeholder="例如：生产服务器" value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
          <p>登录密码将在连接后输入，不保存在服务器列表中。连接后，终端、文件和网络转发在服务器上运行。</p>
          {endpoint.trim().startsWith("http://") && <p className="runtime-http-note">HTTP 不加密登录和终端数据，仅用于你信任的网络。</p>}
        </div>
        <footer className="runtime-editor-footer"><DialogActionStatus message={error}/><div>{selected && <Button variant="danger" disabled={busy || selected.id === activeId} onClick={() => setDeleting(true)}>删除</Button>}<Button disabled={busy} onClick={() => void submit(false)}>保存</Button><Button type="submit" variant="primary" loading={busy} disabled={Boolean(selected && selected.id === activeId)}>连接</Button></div></footer>
      </form></div>
  </DialogFrame>{deleting && <DialogFrame compact title="删除服务器记录" subtitle={selected?.name} onClose={() => setDeleting(false)}><p className="confirm-copy">仅删除这台电脑保存的服务器地址，不删除服务器上的配置或任务。</p><footer className="dialog-actions"><Button onClick={() => setDeleting(false)}>取消</Button><Button variant="danger" onClick={() => { onSave(entries.filter(entry => entry.id !== selected?.id)); choose(null); setDeleting(false); }}>删除记录</Button></footer></DialogFrame>}</>;
}
