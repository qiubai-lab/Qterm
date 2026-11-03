import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ServerApp } from "../server/ServerApp";
import { configureRuntimeApi } from "../server/http";
import { pauseData } from "../server/dataAccess";
import { dataPaused, subscribeDataAccess } from "../server/dataAccess";
import { useSyncExternalStore } from "react";
import { RemoteWindowDragRegion } from "./RemoteWindowDragRegion";
import { EnvironmentControl } from "./EnvironmentControl";
import { NativeWindowControls } from "../workspace/NativeWindowControls";
import { connectRuntime, disconnectRuntime } from "./transport";
import { selectedRuntime, selectRuntime } from "./selection";
import { Button } from "../components/Button";
import { AccessLogControl } from "../server/accessLog/AccessLogControl";
import type { useServerAccess } from "../server/useServerAccess";
import "./remoteRuntime.css";
function RemoteChrome({access}: {access: ReturnType<typeof useServerAccess>}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = controlsRef.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty("--runtime-chrome-width", `${element.getBoundingClientRect().width}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--runtime-chrome-width"); };
  }, []);
  const locked = useSyncExternalStore(subscribeDataAccess, dataPaused);
  const status = access.phase === "workspace" ? locked ? "已锁定" : "已连接" : access.phase === "replaced" ? "已被接管" : access.phase === "reconnecting" ? "重连中" : access.phase === "checking" ? "连接中" : "需要登录";
  return <>{(access.phase !== "workspace" || locked) && <RemoteWindowDragRegion/>}<div ref={controlsRef} className="runtime-desktop-controls"><EnvironmentControl status={status} onLogout={access.phase === "workspace" ? access.logout : undefined}/>{access.phase === "workspace" && !locked && <div className="window-controls runtime-access-controls"><AccessLogControl/></div>}<NativeWindowControls/></div></>;
}
export function RemoteDesktopApp() {
  const [ready, setReady] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true; pauseData();
    void connectRuntime(selectedRuntime!.endpoint).then(base => { if (live) { configureRuntimeApi(base); setReady(true); } }, reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [attempt]);
  if (ready) return <ServerApp renderChrome={access => <RemoteChrome access={access}/>}/>;
  return <main className="runtime-startup"><RemoteWindowDragRegion/><div className="runtime-desktop-controls"><NativeWindowControls/></div><h2>{selectedRuntime!.name}</h2><code>{selectedRuntime!.endpoint}</code><p role="status">{error || "正在连接服务器…"}</p>{error && <Button onClick={() => { setError(""); setAttempt(attempt + 1); }}>重试</Button>}<Button onClick={() => { void disconnectRuntime().then(() => { selectRuntime(null); window.location.reload(); }).catch(reason => setError(String(reason))); }}>返回本机</Button></main>;
}
