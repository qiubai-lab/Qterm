import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { ServerApp } from "../../server/ServerApp";
import { dataPaused, subscribeDataAccess } from "../../server/dataAccess";
import type { useServerAccess } from "../../server/useServerAccess";
import { activeTransferCount } from "../../server/services/transfers";
import { flushRuntime } from "../switchGuard";
import { framePort } from "./frame";
import { AccessLogDialog } from "../../server/accessLog/AccessLogDialog";
const labels = { workspace: "已连接", checking: "连接中", login: "需要登录", occupied: "等待接管", reconnecting: "重连中", disconnected: "需要登录", replaced: "已被接管" };
type Access = ReturnType<typeof useServerAccess>;
function MemberAccess({ access }: { access: Access }) {
  const [showLog, setShowLog] = useState(false);
  const paused = useSyncExternalStore(subscribeDataAccess, dataPaused);
  const status = access.phase === "workspace" && paused ? "已锁定" : labels[access.phase];
  if (showLog && status !== "已连接") setShowLog(false);
  useLayoutEffect(() => {
    framePort!.status(status, async () => {
      if (access.phase === "workspace") await access.logout();
    }, flushRuntime, activeTransferCount, () => setShowLog(true));
  }, [access, status]);
  return showLog ? <AccessLogDialog onClose={() => setShowLog(false)}/> : null;
}
export function RemoteMember() {
  return <ServerApp renderChrome={access => <MemberAccess access={access}/>}/>;
}
