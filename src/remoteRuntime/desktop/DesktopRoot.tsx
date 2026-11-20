import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { currentDesktopPlatform } from "../../lib/tauri/window";
import { resolveAppShortcut } from "../../app/shortcuts";
import { connectRuntime, disconnectRuntime } from "../transport";
import { restoreWindowSession, rememberWindowSession } from "./windowSession";
import { DesktopContext, useEnvironments } from "./context";
import { DesktopEnvironments } from "./environments";
import { RemoteWorkbenchFrame } from "./RemoteWorkbenchFrame";
import "./desktop.css";

function desktopShortcut(host: DesktopEnvironments, event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.altKey || event.type !== "keydown") return;
  const target = event.target as HTMLElement | null;
  if (target?.ownerDocument?.querySelector('[aria-modal="true"],[role="menu"]')) return;
  const platform = currentDesktopPlatform();
  const primary = platform === "macos" ? event.metaKey && !event.ctrlKey && !event.shiftKey : event.ctrlKey && !event.metaKey && event.shiftKey;
  if (primary && event.key.toLowerCase() === "t") {
    event.preventDefault(); event.stopImmediatePropagation();
    document.querySelector<HTMLButtonElement>(".new-workspace-tab")?.click();
    return;
  }
  const command = resolveAppShortcut(event, platform);
  if (command?.type !== "selectWorkspace" || host.snapshot().environments.length < 2) return;
  if (target?.closest?.('input:not(.xterm-helper-textarea), textarea:not(.xterm-helper-textarea), [contenteditable=true]')) return;
  const tab = host.snapshot().environments.flatMap(env => (env.tabs?.items ?? [{ id: "" }]).map(item => ({ key: env.key, id: item.id })))[command.index];
  if (tab) { event.preventDefault(); event.stopImmediatePropagation(); host.focus(tab.key, tab.id); }
}

export function DesktopRoot({ children }: { children: ReactNode }) {
  const [host] = useState(() => new DesktopEnvironments({ connect: connectRuntime, disconnect: disconnectRuntime }));
  const { active, environments } = useEnvironments(host);
  const restored = useRef(false);
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-remote-foreground", active !== "local");
    return () => document.documentElement.removeAttribute("data-remote-foreground");
  }, [active]);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      restoreWindowSession(host);
    }
    const stop = rememberWindowSession(host);
    const keydown = (event: KeyboardEvent) => desktopShortcut(host, event);
    window.addEventListener("keydown", keydown, true);
    return () => { stop(); window.removeEventListener("keydown", keydown, true); };
  }, [host]);
  return <DesktopContext.Provider value={host}>{children}{environments.filter(env => env.entry).map(env =>
    <RemoteWorkbenchFrame shortcut={desktopShortcut} host={host} env={env} key={env.runtimeId} visible={env.key === active}/>)}</DesktopContext.Provider>;
}
