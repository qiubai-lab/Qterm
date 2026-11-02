import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { Button, StatusBadge } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { browserLabel, eventLabel, formatTime, reasonLabel, type AccessEvent } from "./model";

export function AccessLogDetail({ event, onClose }: { event: AccessEvent; onClose: () => void }) {
  return <DialogFrame title="访问记录详情" className="access-log-detail" onClose={onClose}>
    <div className="access-log-detail-body">
      <div className="access-log-detail-summary">
        <span className="access-log-detail-icon" data-success={event.success}><Icon name={event.success ? "checkCircle" : "alertCircle"} size={22}/></span>
        <div className="access-log-detail-heading"><h3>{eventLabel(event.kind)}</h3><p>{reasonLabel(event.reason)}</p></div>
        <StatusBadge size="compact" tone={event.success ? "success" : "danger"}>{event.success ? "成功" : "失败"}</StatusBadge>
      </div>
      <dl className="access-log-facts">
        <div><dt>发生时间</dt><dd><time dateTime={new Date(event.timestamp).toISOString()}>{formatTime(event.timestamp)}</time><span className="access-log-local-time">本地时间</span></dd></div>
        <div><dt>来源 IP</dt><dd className="access-log-mono">{event.source.ip ?? "系统事件或来源不可用"}</dd></div>
        <div><dt>客户端</dt><dd>{browserLabel(event.source.browser)}<p className="access-log-user-agent">{event.source.browser ?? "系统事件或未提供浏览器信息"}</p></dd></div>
      </dl>
      <section className="access-log-reference" aria-labelledby="access-log-reference-title">
        <h4 id="access-log-reference-title">关联信息</h4>
        <dl>
          <div><dt>会话关联号</dt><dd>{event.source.session ?? "未关联已认证会话"}</dd></div>
          <div><dt>记录编号</dt><dd>{event.id}</dd></div>
          <div><dt>UTC 时间</dt><dd>{new Date(event.timestamp).toISOString()}</dd></div>
        </dl>
      </section>
    </div>
    <footer className="access-log-detail-footer"><p>来源信息不代表已验证的用户身份。</p><Button size="compact" data-dialog-autofocus onClick={onClose}>返回列表</Button></footer>
  </DialogFrame>;
}
