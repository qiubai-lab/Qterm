import { Icon } from "../components/Icon";
import { isElementOverflowing, useThemedTooltip } from "../components/useThemedTooltip";
import type { ServerEntry } from "./model";
export function ServerEntryRow({entry,selected,active,busy,onChoose}:{entry:ServerEntry;selected:boolean;active:boolean;busy:boolean;onChoose:()=>void}) {
  const [ref, describedBy, hide, show, tooltip] = useThemedTooltip<HTMLButtonElement>({tooltip:`${entry.name}\n${entry.endpoint}`,shouldShow:element=>Array.from(element.querySelectorAll<HTMLElement>("strong,small")).some(isElementOverflowing)});
  return <><button ref={ref} data-server-id={entry.id} aria-pressed={selected} aria-describedby={describedBy} disabled={busy} onClick={onChoose} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}><Icon name="server" size={15}/><span><strong>{entry.name}</strong><small>{entry.endpoint}</small></span>{active&&<small>当前</small>}</button>{tooltip}</>;
}
