import type { SessionEvent } from "../lib/tauri/sessions";
import { demoProfiles } from "./fixtures";
import { DemoTerminalSession } from "./terminalSession";

const sessions = new Map<string, DemoTerminalSession>();
const connectionTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

export function openDemoSession(columns: number, rows: number, onData: (data: Uint8Array) => void, onEvent: (event: SessionEvent) => void, profileId?: string, cwd?: string) {
  const profile = profileId ? demoProfiles.find(item => item.id === profileId) : undefined;
  if (profileId && !profile) throw new Error("此连接不属于演示环境。");
  const id = `demo-session-${crypto.randomUUID()}`;
  const session = new DemoTerminalSession({
    host: profile ? profile.host : "localhost", cwd, columns, rows, output: onData,
    closed: () => {
      connectionTimers.get(id)?.forEach(clearTimeout);
      connectionTimers.delete(id); sessions.delete(id);
      onEvent({ type: "stateChanged", state: "closed" });
    },
  });
  sessions.set(id, session);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const schedule = (delay: number, action: () => void) => timers.push(setTimeout(() => { if (sessions.has(id)) action(); }, delay));
  if (profile) {
    const node = { profileId: profile.id, name: profile.name, host: profile.host, port: 22, index: 0, total: 1, role: "target" as const };
    schedule(0, () => onEvent({ type: "stateChanged", state: "connecting" }));
    schedule(100, () => onEvent({ type: "routeProgress", node, stage: "connect" }));
    schedule(250, () => onEvent({ type: "routeProgress", node, stage: "authenticate" }));
  }
  schedule(profile ? 500 : 0, () => {
    connectionTimers.delete(id);
    onEvent({ type: "stateChanged", state: "connected" }); session.start();
  });
  connectionTimers.set(id, timers);
  return { sessionId: id, cwd: session.cwd };
}

export function getDemoSession(id: string): DemoTerminalSession {
  const session = sessions.get(id);
  if (!session) throw new Error("演示会话已关闭。");
  return session;
}

export function closeDemoSession(id: string) { sessions.get(id)?.close(); }
export function resetDemoSessions() { [...sessions.values()].forEach(session => session.close()); }
