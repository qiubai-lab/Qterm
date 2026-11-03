import { isDemo, isRemoteDesktop } from "../lib/runtime/environment";
import { EnvironmentControl } from "../remoteRuntime/EnvironmentControl";
import { NativeWindowControls } from "./NativeWindowControls";
import type { ReactNode } from "react";
import { Icon } from "../components/Icon";
import { useWindowTitlebar } from "./useWindowTitlebar";
import { WorkspaceLogoutControl } from "./WorkspaceLogoutControl";
/** Shared chrome; only native window operations and browser logout differ. */
export function WorkspaceChrome({ children, onLogout, webActions }: { children: ReactNode; webActions?: ReactNode; onLogout?: () => Promise<void> }) {
  const beginWindowDrag = useWindowTitlebar();
  return <header className="app-chrome" onPointerDown={onLogout && !isRemoteDesktop ? undefined : beginWindowDrag}>
    <div className="app-brand" aria-label="Qterm"><Icon name="terminal" size={15}/><span>Qterm</span></div>
    {children}
    {isRemoteDesktop ? <div className="runtime-chrome-spacer"/> : onLogout ? <WorkspaceLogoutControl onLogout={onLogout}>{webActions}</WorkspaceLogoutControl> : <>
      {!isDemo && <EnvironmentControl/>}<NativeWindowControls/>
    </>}
  </header>;
}

