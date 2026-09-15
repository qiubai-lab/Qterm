import type { SessionEvent } from "../lib/tauri/sessions";
import { demoProfiles } from "./fixtures";

type Purpose = "files" | "git" | "network";
interface FeatureSession { profileId: string; purpose: Purpose; timer: ReturnType<typeof setTimeout>; onEvent: (event: SessionEvent) => void }
const sessions = new Map<string, FeatureSession>();

/** Browser backend connections only; workspace controllers own UI lifecycle. */
export function openFeatureSession(purpose: Purpose, profileId: string, onEvent: (event: SessionEvent) => void): string {
  if (!demoProfiles.some(profile => profile.id === profileId)) throw new Error("此连接不属于演示环境。");
  const id = `demo-${purpose}-${crypto.randomUUID()}`;
  const timer = setTimeout(() => { if (sessions.has(id)) onEvent({ type: "stateChanged", state: "connected" }); }, 50);
  sessions.set(id, { purpose, profileId, timer, onEvent });
  return id;
}
export function featureTarget(id: string, purpose: Purpose, profileId?: string): string {
  const session = sessions.get(id);
  if (!session || session.purpose !== purpose || (profileId && profileId !== session.profileId)) throw new Error("演示连接已关闭或与当前目标不匹配。");
  return session.profileId;
}
export function closeFeatureSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  clearTimeout(session.timer); sessions.delete(id);
  session.onEvent({ type: "stateChanged", state: "closed" });
  return true;
}
export function resetFeatureSessions() { for (const id of [...sessions.keys()]) closeFeatureSession(id); }
