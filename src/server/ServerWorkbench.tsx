import { useAppTheme } from "../app/theme/AppThemeProvider";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTerminalLock } from "../workspace/useTerminalLock";
import { WorkbenchActivity } from "../workspace/workbenchActivity";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import { WorkspaceTerminalLinkHost } from "../workspace/WorkspaceTerminalLinkHost";
import { OnboardingProvider } from "../onboarding/OnboardingProvider";
import { TerminalNotificationProvider } from "../terminal/notifications/TerminalNotificationProvider";
import { TerminalLockRestore, TerminalLockScreen } from "../components/dialogs/TerminalLockDialogs";
import { ServerRuntimeRestore } from "./ServerRuntimeRestore";
import { serverTerminalLock } from "./terminalLock";
import { dataPaused, subscribeDataAccess } from "./dataAccess";

/** Check admission before mounting readers; preserve drafts and runtime owners on later locks. */
export function ServerWorkbench({ onLogout }: { onLogout: () => Promise<void> }) {
  const { commitTheme } = useAppTheme();
  const lock = useTerminalLock(serverTerminalLock);
  const paused = useSyncExternalStore(subscribeDataAccess, dataPaused);
  const [mounted, setMounted] = useState(false);
  const active = !lock.locked && !paused;
  if (active && !mounted) setMounted(true);
  const { locked, restore } = lock;
  useEffect(() => { if (paused && !locked) void restore(); }, [paused, locked, restore]);
  return <>
    <WorkbenchActivity value={active}>
      <div className="server-workbench-content" hidden={!active} inert={!active} aria-hidden={!active || undefined}>
        {(mounted || active) && <WorkspaceProvider><OnboardingProvider mode="desktop"><TerminalNotificationProvider>
          <WorkspaceShell onLogout={onLogout} terminalLockState={lock} onThemeRestored={commitTheme}/>
          <ServerRuntimeRestore/>
          <WorkspaceTerminalLinkHost/>
        </TerminalNotificationProvider></OnboardingProvider></WorkspaceProvider>}
      </div>
    </WorkbenchActivity>
    {!active && (lock.checking || !lock.locked
      ? <TerminalLockRestore error={lock.error} onRetry={() => void lock.restore()}/>
      : <TerminalLockScreen description="数据刷新和浏览器连接已暂停，后台终端任务继续运行；解锁后恢复连接。" unlock={lock.unlock} onUnlocked={() => undefined}/>)}
  </>;
}
