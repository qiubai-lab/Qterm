import { useEffect, useState } from "react";
import { useThemedTooltip } from "../components/useThemedTooltip";
import type { ServerEntry } from "./model";
/** A stable identity label; only its material and status dot breathe, never its text. */
export function RuntimeStatusTag({entry, status}: {entry: ServerEntry; status: string}) {
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setPaused(document.hidden || !document.hasFocus());
    document.addEventListener("visibilitychange", update); window.addEventListener("blur", update); window.addEventListener("focus", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("blur", update); window.removeEventListener("focus", update); };
  }, []);
  const [ref, description, hide, show, tooltip] = useThemedTooltip<HTMLSpanElement>({tooltip:`${entry.name} · ${status}\n${entry.endpoint}`});
  return <><span ref={ref} className="runtime-status-tag" data-status={status} data-paused={paused || undefined} tabIndex={0} aria-label={`${entry.name}，${status}`} aria-describedby={description} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    <i className="runtime-status-dot" aria-hidden="true"/><span className="runtime-tag-name">{entry.name}</span>{status !== "已连接" && <small>{status}</small>}
  </span>{tooltip}</>;
}
