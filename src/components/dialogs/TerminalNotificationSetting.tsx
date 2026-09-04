import { useTerminalNotifications } from "../../terminal/notifications/TerminalNotificationProvider";

export function TerminalNotificationSetting() {
  const notifications = useTerminalNotifications();
  return <div className="settings-notification-option">
    <div className="settings-row">
      <span><strong>终端通知 <span className="settings-experimental-tag">实验功能</span></strong><small>接收终端程序的提醒，在终端顶部标记未读；Qterm 位于后台时发送系统通知。需要 CLI 支持或配置通知。</small></span>
      <label className="settings-switch">
        <input className="settings-switch-input" type="checkbox" role="switch" aria-label="终端通知" checked={notifications.enabled} disabled={!notifications.ready || notifications.busy} onChange={event => {
          void notifications.update(event.target.checked).catch(() => undefined);
        }}/>
        <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb"/></span>
      </label>
    </div>
    <div className="settings-row">
      <span><strong>显示通知正文</strong><small>在系统通知中显示终端程序发送的标题与正文，可能出现在锁屏上；关闭时仅显示来源和通用提醒。</small></span>
      <label className="settings-switch">
        <input className="settings-switch-input" type="checkbox" role="switch" aria-label="显示通知正文" checked={notifications.showBody} disabled={!notifications.ready || notifications.busy || !notifications.enabled} onChange={event => { void notifications.updateBody(event.target.checked).catch(() => undefined); }}/>
        <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb"/></span>
      </label>
    </div>
    {notifications.error ? <p className="inline-message settings-message" role="alert">{notifications.error}</p> : null}
  </div>;
}
