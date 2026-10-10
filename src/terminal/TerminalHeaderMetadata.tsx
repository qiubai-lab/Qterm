import type { ComponentProps } from "react";
import { TerminalActivityStatus } from "./TerminalActivityStatus";
import { TerminalProtocolTag } from "./notifications/TerminalProtocolTag";
import { useTerminalActivity } from "./useTerminalActivity";
import { useTerminalTitlePreference } from "./TerminalTitleProvider";

export function TerminalHeaderMetadata({ sessionKey, ...props }: ComponentProps<typeof TerminalProtocolTag> & { sessionKey: string }) {
  const { title, progress } = useTerminalActivity(sessionKey);
  const { enabled } = useTerminalTitlePreference();
  return <>
    <TerminalProtocolTag {...props}/>
    <TerminalActivityStatus key={sessionKey} title={props.connected && enabled ? title : ""} progress={props.connected ? progress : null}/>
  </>;
}
