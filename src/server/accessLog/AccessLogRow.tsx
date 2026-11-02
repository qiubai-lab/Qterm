import { Icon } from "../../components/Icon";
import { isElementOverflowing, useThemedTooltip } from "../../components/useThemedTooltip";
import { browserLabel, eventLabel, formatTime, reasonLabel, type AccessEvent } from "./model";

export function AccessLogRow({ event, selected, onOpen }: { event: AccessEvent; selected: boolean; onOpen: () => void }) {
  const source = event.source.ip ?? "系统 / 未知";
  const reason = reasonLabel(event.reason);
  const browser = browserLabel(event.source.browser);
  const [ref, descriptionId, hide, show, tooltip] = useThemedTooltip<HTMLButtonElement>({
    tooltip: `${reason} · ${source} · ${browser}`,
    shouldShow: element => Array.from(element.querySelectorAll<HTMLElement>("[data-log-text]")).some(isElementOverflowing),
    disabled: selected,
  });
  return <li>
    <button ref={ref} className="access-log-row" aria-haspopup="dialog" aria-describedby={descriptionId}
      aria-label={`${formatTime(event.timestamp)} ${eventLabel(event.kind)} ${event.success ? "成功" : "失败"}`}
      data-selected={selected || undefined} onClick={() => { hide(); onOpen(); }}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={event => { if (event.key === "Escape") hide(); }}>
      <time dateTime={new Date(event.timestamp).toISOString()}>{formatTime(event.timestamp)}</time>
      <span className="access-log-event">{eventLabel(event.kind)}</span>
      <span className="access-log-result" data-success={event.success}><span aria-hidden="true"/>{event.success ? "成功" : "失败"}</span>
      <span className="access-log-reason" data-log-text>{reason}</span>
      <span className="access-log-source" data-log-text>{source}</span>
      <span className="access-log-browser" data-log-text>{browser}</span>
      <Icon name="chevronDown" size={12}/>
    </button>
    {tooltip}
  </li>;
}
