import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { OverlayScrollArea } from "../../components/scrollbars/OverlayScrollArea";
import { AccessLogSkeleton } from "./AccessLogSkeleton";
import { AccessLogRow } from "./AccessLogRow";
import { AccessLogDetail } from "./AccessLogDetail";
import { useAccessLog } from "./useAccessLog";
import { eventLabels, type AccessEvent, type Filters } from "./model";
import "./accessLog.css";

export function AccessLogDialog({ onClose }: { onClose: () => void }) {
  const [filters, setFilters] = useState<Filters>({ period: "7", kind: "", result: "" });
  const [detail, setDetail] = useState<AccessEvent | null>(null);
  const log = useAccessLog(filters);
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; }, [log.page, log.busy]);
  function filter(key: keyof Filters, value: string) { setFilters(current => ({ ...current, [key]: value })); }
  return <>
    <DialogFrame title="访问记录" titleIcon={<Icon name="history" size={17}/>} subtitle="工作台访问与安全事件" wide className="access-log-dialog" dismissible={!detail} blocking={false} onClose={onClose}>
      <div className="access-log-toolbar">
        <label>时间范围<select aria-label="时间范围" value={filters.period} onChange={event => filter("period", event.target.value)}><option value="1">最近 24 小时</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">全部保留记录</option></select></label>
        <label>事件类型<select aria-label="事件类型" value={filters.kind} onChange={event => filter("kind", event.target.value)}><option value="">全部事件</option>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>结果<select aria-label="结果" value={filters.result} onChange={event => filter("result", event.target.value)}><option value="">全部结果</option><option value="true">成功</option><option value="false">失败</option></select></label>
        <Button size="compact" disabled={log.busy} onClick={log.refresh}><Icon name="refresh" size={13}/>刷新</Button>
      </div>
      <OverlayScrollArea ref={viewport} className="access-log-scroll" viewportClassName="access-log-viewport">
        <div className="access-log-columns" aria-hidden="true"><span>发生时间</span><span>事件</span><span>结果</span><span>说明</span><span>来源 IP</span><span>客户端</span><span/></div>
        <ul className="access-log-list" aria-label="访问记录列表" aria-busy={log.busy}>
          {log.busy ? <AccessLogSkeleton/> : log.page?.entries.map(event => <AccessLogRow key={event.id} event={event} selected={detail?.id === event.id} onOpen={() => setDetail(event)}/>)}
        </ul>
        {!log.busy && !log.page?.entries.length && <div className="access-log-empty"><Icon name="history" size={24}/><strong>{log.error ? "暂时无法读取记录" : "没有符合条件的记录"}</strong><p>{log.error ? "可点击刷新重新尝试。" : "访问与安全事件会由服务端自动记录。"}</p></div>}
      </OverlayScrollArea>
      <footer className="access-log-footer">
        <div className="access-log-footer-copy">
          <span>本页 {log.busy ? "—" : log.page?.entries.length ?? 0} 条 <span className="access-log-footer-meta">· 本地时间 · 最长保留 30 天</span></span>
          <span className="access-log-message" role="status" aria-live="polite" data-error={Boolean(log.error || log.page && !log.page.recordingHealthy)}>
            {log.busy ? "正在加载访问记录…" : log.error || (log.page && !log.page.recordingHealthy ? `日志记录异常，部分记录可能缺失${log.page.droppedEvents ? `（${log.page.droppedEvents} 条）` : ""}。请检查服务端日志存储。` : "点击记录查看详情")}
          </span>
        </div>
        <nav className="access-log-pagination" aria-label="访问记录分页">
          <Button size="compact" disabled={log.busy || log.pageNumber === 1} onClick={log.previous}>上一页</Button>
          <span aria-live="polite">第 {log.pageNumber} 页</span>
          <Button size="compact" disabled={log.busy || !log.page?.nextCursor} onClick={log.next}>下一页</Button>
        </nav>
      </footer>
    </DialogFrame>
    {detail && <AccessLogDetail event={detail} onClose={() => setDetail(null)}/>}
  </>;
}
