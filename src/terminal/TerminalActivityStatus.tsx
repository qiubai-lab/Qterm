import { Icon } from "../components/Icon";
import { isElementOverflowing, useThemedTooltip } from "../components/useThemedTooltip";
import type { TerminalProgress } from "./terminalActivity";
import { applicationTerminalTitle } from "./terminalTitle";
import { useTerminalProgressPresence } from "./useTerminalProgressPresence";

function ApplicationTitle({ title }: { title: string }) {
  const [anchor, describedBy, hide, show, tooltip] = useThemedTooltip<HTMLSpanElement>({ tooltip: title, shouldShow: isElementOverflowing });
  return <>
    <span className="terminal-application-title" tabIndex={0} aria-label={`应用标题：${title}`} aria-describedby={describedBy}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <Icon name="terminal" size={12}/>
      <span ref={anchor} className="terminal-application-title-text">{title}</span>
    </span>
    {tooltip}
  </>;
}

function TaskProgress({ progress, closing, onAnimationEnd }: { progress: TerminalProgress } & Pick<ReturnType<typeof useTerminalProgressPresence>, "closing" | "onAnimationEnd">) {
  const label = { running: "进行中", error: "错误", indeterminate: "正在运行", paused: "已暂停" }[progress.state];
  const description = progress.value === null ? label : `${label} ${progress.value}%`;
  const arc = progress.state === "indeterminate" ? 28 : progress.value ?? 0;
  return <span className="terminal-task-progress" data-state={progress.state} data-presence={closing ? "closing" : "open"} onAnimationEnd={onAnimationEnd} aria-hidden={closing || undefined} role="progressbar" aria-label={description}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value ?? undefined} aria-valuetext={description}>
    <span className="terminal-progress-indicator" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="terminal-progress-ring">
        <circle className="terminal-progress-track" cx="8" cy="8" r="6"/>
        <circle className="terminal-progress-fill" cx="8" cy="8" r="6" pathLength="100" strokeDasharray={`${arc} 100`}/>
      </svg>
      {progress.state === "paused" && <span className="terminal-progress-pause"/>}
      {progress.state === "error" && <span className="terminal-progress-error">!</span>}
    </span>
    <span className="terminal-progress-label">{label}</span>
    {progress.value !== null && <strong className="terminal-progress-value">{progress.value}<span>%</span></strong>}
  </span>;
}

/** Presentation only: raw activity remains in the session registry. */
export function TerminalActivityStatus({ title: rawTitle, progress }: { title: string; progress: TerminalProgress | null }) {
  const title = applicationTerminalTitle(rawTitle);
  const presence = useTerminalProgressPresence(progress);
  if (!title && !presence.progress) return null;
  return <div className="terminal-activity-metadata" data-has-title={Boolean(title)} data-has-progress={Boolean(presence.progress)}>
    {title && <ApplicationTitle title={title}/>}
    {presence.progress && <TaskProgress progress={presence.progress} closing={presence.closing} onAnimationEnd={presence.onAnimationEnd}/>}
  </div>;
}
