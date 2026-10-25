import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OverlayScrollArea } from "../components/scrollbars/OverlayScrollArea";
import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { WebLibraryDrawerFrame } from "./WebLibraryDrawerFrame";
import type { WebDrawerPhase } from "./useWebLibraryDrawer";
import type { WebEntry, WebLibrary, WebLibraryAction } from "../lib/tauri/webLibrary";
import "./webLibrary.css";

interface Props {
  phase?: WebDrawerPhase;
  profileName: string;
  data: WebLibrary;
  busy: boolean;
  error: string;
  onUpdate: (action?: WebLibraryAction) => Promise<boolean>;
  onOpen: (url: string) => void;
  onClose: () => void;
}

export function WebLibraryDialog({ profileName, data, busy, error, onUpdate, onOpen, onClose, phase = "open" }: Props) {
  const [tab, setTab] = useState<"history" | "bookmarks">("history");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<WebLibraryAction | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (!editing) renameTrigger.current?.focus(); }, [editing]);
  const id = useId();
  const items = data[tab].map(entry => ({ ...entry, title: tab === "history" ? data.bookmarks.find(saved => saved.url === entry.url)?.title ?? (entry.title === entry.url ? new URL(entry.url).host : entry.title) : entry.title }))
    .filter(entry => `${entry.title} ${entry.url}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const choose = (value: typeof tab) => { setTab(value); setEditing(null); };
  const bookmark = (entry: WebEntry) => void onUpdate({ kind: "bookmark", url: entry.url, title: entry.title });

  return <>
    <WebLibraryDrawerFrame profileName={profileName} phase={phase} onClose={onClose} dismissible={!confirm}>
      <div className="web-library-toolbar">
        <div className="web-library-search"><Icon name="search" size={14}/><input type="search" aria-label="搜索浏览记录" placeholder="搜索名称或地址" value={search} onChange={e => setSearch(e.target.value)} data-dialog-autofocus/></div>
        <div className="web-library-tabs" role="tablist" aria-label="记录类型">
          <span className="web-library-tab-indicator" data-tab={tab} aria-hidden="true"/>
          {(["history", "bookmarks"] as const).map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => choose(value)} onKeyDown={event => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); const next = event.key === "Home" ? "history" : event.key === "End" ? "bookmarks" : value === "history" ? "bookmarks" : "history";
              choose(next); document.getElementById(`${id}-${next}`)?.focus();
            }
          }}><Icon name={value === "history" ? "history" : "bookmark"} size={13}/>{value === "history" ? "历史" : "收藏"}<small>{data[value].length}</small></button>)}
        </div>
      </div>
      <OverlayScrollArea className="web-library-scroll" viewportClassName="web-library-list" density="compact" viewportProps={{ role: "tabpanel", id: `${id}-panel`, "aria-labelledby": `${id}-${tab}`, "aria-busy": busy }}>
        {items.length === 0 && <div className="web-library-empty"><Icon name={tab === "history" ? "history" : "bookmark"} size={24}/><strong>{busy && !data[tab].length ? "正在读取…" : error ? "暂时无法读取记录" : search ? "没有匹配的记录" : tab === "history" ? "暂无访问历史" : "暂无收藏"}</strong><span>{error ? "请查看下方提示并重试" : search ? "尝试其他名称或地址" : tab === "history" ? "访问的网页会按最近使用排序" : "点击地址栏星标，收藏常用网页"}</span></div>}
        {items.map(entry => <div className="web-library-row" key={entry.url}>
          <button type="button" className="web-library-open" disabled={busy || editing === entry.url} onClick={() => onOpen(entry.url)} aria-label={`打开 ${entry.title}`}>
            <Icon name="browser" size={15}/><span>
              <span className="web-library-heading"><strong title={entry.title}>{entry.title}</strong>
                {tab === "history" && <time dateTime={new Date(entry.updatedAt).toISOString()}>{new Date(entry.updatedAt).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>}
              </span>
              <code title={entry.url}>{entry.url}</code>
            </span>
          </button>
          <div className="web-library-row-actions">
            {tab === "bookmarks" && <ThemedTooltipButton type="button" tooltip="重命名收藏" aria-label={`重命名 ${entry.title}`} disabled={busy} onClick={event => { renameTrigger.current = event.currentTarget; setEditing(entry.url); setTitle(entry.title); }}><Icon name="edit" size={13}/></ThemedTooltipButton>}
            <ThemedTooltipButton type="button" tooltip={data.bookmarks.some(e => e.url === entry.url) ? "取消收藏" : "收藏网页"} aria-label={`${data.bookmarks.some(e => e.url === entry.url) ? "取消收藏" : "收藏"} ${entry.title}`} aria-pressed={data.bookmarks.some(e => e.url === entry.url)} disabled={busy} onClick={() => data.bookmarks.some(e => e.url === entry.url) ? void onUpdate({ kind: "unbookmark", url: entry.url }) : bookmark(entry)}><Icon name="bookmark" size={13}/></ThemedTooltipButton>
            {tab === "history" && <ThemedTooltipButton type="button" tooltip="删除此记录" aria-label={`删除记录 ${entry.title}`} disabled={busy} onClick={() => setConfirm({ kind: "removeVisit", url: entry.url })}><Icon name="trash" size={13}/></ThemedTooltipButton>}
          </div>
          {editing === entry.url && <form className="web-library-rename" onSubmit={event => { event.preventDefault(); void onUpdate({ kind: "bookmark", url: entry.url, title }).then(ok => { if (ok) setEditing(null); }); }}>
            <input autoFocus aria-label="收藏名称" value={title} maxLength={128} onChange={event => setTitle(event.target.value)} required/>
            <Button size="compact" type="submit" disabled={busy || !title.trim()}>保存</Button><Button size="compact" variant="danger" onClick={() => setEditing(null)}>取消</Button>
          </form>}
        </div>)}
      </OverlayScrollArea>
      <footer className="web-library-footer">
        <span className="web-library-status" title={error || undefined} role={error ? "alert" : "status"}>{error || (busy ? "正在处理…" : tab === "history" ? "每个连接保留最近 200 个地址" : "收藏保存在当前设备")}</span>
        {error && <Button size="compact" disabled={busy} onClick={() => void onUpdate()}>重试</Button>}
        {tab === "history" && <Button size="compact" variant="danger" disabled={busy || !data.history.length} onClick={() => setConfirm({ kind: "clearHistory" })}>清空历史</Button>}
      </footer>
    </WebLibraryDrawerFrame>
    {confirm && createPortal(<DialogFrame title={confirm.kind === "clearHistory" ? "清空此连接的访问历史？" : "删除此访问记录？"} subtitle="仅删除访问历史，收藏不受影响。此操作无法撤销。" compact onClose={() => { if (!busy) setConfirm(null); }} dismissible={!busy}>
      <div className="dialog-actions end"><Button variant="danger" disabled={busy} onClick={() => setConfirm(null)}>取消</Button><Button variant="dangerSolid" loading={busy} onClick={() => void onUpdate(confirm).then(ok => { if (ok) setConfirm(null); })}>确认删除</Button></div>
      <p className="web-library-status" role={error ? "alert" : "status"}>{error}</p>
    </DialogFrame>, document.body)}
  </>;
}
