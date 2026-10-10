import type { ComponentProps } from "react";
import { isElementOverflowing, useThemedTooltip } from "../components/useThemedTooltip";
import { TerminalProtocolTag } from "./notifications/TerminalProtocolTag";
import { useTerminalActivity } from "./useTerminalActivity";
import type { TerminalProgress } from "./terminalActivity";

function progressLabel(progress: TerminalProgress) {
  const label = { running: "进行中", error: "错误", indeterminate: "正在运行", paused: "已暂停" }[progress.state];
  return progress.value === null ? label : `${label} ${progress.value}%`;
}

function ApplicationTitle({ title }: { title: string }) {
  const [anchor, describedBy, hide, show, tooltip] = useThemedTooltip<HTMLSpanElement>({ tooltip: title, shouldShow: isElementOverflowing });
  return <><span ref={anchor} tabIndex={0} className="terminal-application-title" aria-label={`应用标题：${title}`} aria-describedby={describedBy}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>{title}</span>{tooltip}</>;
}

export function TerminalHeaderMetadata({ sessionKey, ...props }: ComponentProps<typeof TerminalProtocolTag> & { sessionKey: string }) {
  const { title, progress } = useTerminalActivity(sessionKey);
  return <>
    <TerminalProtocolTag {...props}/>
    {props.connected && <div className="terminal-activity-metadata">
      {title && <ApplicationTitle title={title}/>}
      {progress && <span className="terminal-task-progress" data-state={progress.state} role="progressbar" aria-label={progressLabel(progress)}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value ?? undefined} aria-valuetext={progressLabel(progress)}>{progressLabel(progress)}</span>}
    </div>}
  </>;
}
