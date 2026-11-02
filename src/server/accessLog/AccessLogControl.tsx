import { createPortal } from "react-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "../../components/Icon";
import { ThemedTooltipButton } from "../../components/ThemedTooltipButton";
import { AccessLogDialog } from "./AccessLogDialog";
import { useWorkbenchActive } from "../../workspace/workbenchActivity";
import { dataPaused, subscribeDataAccess } from "../dataAccess";

export function AccessLogControl() {
  const [open, setOpen] = useState(false);
  const active = useWorkbenchActive();
  const paused = useSyncExternalStore(subscribeDataAccess, dataPaused);
  useEffect(() => subscribeDataAccess(() => { if (dataPaused()) setOpen(false); }), []);
  if ((!active || paused) && open) setOpen(false);
  if (!active || paused) return null;
  return <>
    <ThemedTooltipButton tooltip="访问记录" aria-label="访问记录" onClick={() => setOpen(true)}><Icon name="history" size={14}/></ThemedTooltipButton>
    {open && createPortal(<AccessLogDialog onClose={() => setOpen(false)}/>, document.body)}
  </>;
}
