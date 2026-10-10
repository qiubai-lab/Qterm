import { createTerminalActivity, EMPTY_ACTIVITY, type TerminalActivity } from "./terminalActivity";

// Registry holds references to the view-owned runtime, never another state copy.
const activities = new Map<string, TerminalActivity>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const subscribeTerminalActivity = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getTerminalActivity = (key: string) => activities.get(key);
export const getTerminalActivitySnapshot = (key: string) => activities.get(key)?.snapshot() ?? EMPTY_ACTIVITY;

export function registerTerminalActivity(key: string) {
  const activity = createTerminalActivity(emit);
  activities.set(key, activity); emit();
  return { activity, dispose() { if (activities.get(key) === activity) { activities.delete(key); emit(); } } };
}
