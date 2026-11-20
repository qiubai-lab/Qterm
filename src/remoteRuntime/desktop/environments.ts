import { readRememberedTabs, rememberTabs } from "./rememberedTabs";
import { randomId } from "../../lib/randomId";
import { MAX_WORKSPACES } from "../../workspace/workspaceLimits";
import type { ServerEntry } from "../model";
import type { EnvironmentTabs, FramePort, WorkspaceCommands, WorkspacePort } from "./frame";

export interface DesktopEnvironment {
  key: string;
  name: string;
  entry?: ServerEntry;
  runtimeId?: string;
  apiBase?: string;
  status: string;
  error?: string;
  closing?: boolean;
  tabs?: EnvironmentTabs;
}
type Transport = {
  connect(endpoint: string, id: string): Promise<string>;
  disconnect(id: string): Promise<void>;
};
interface Access {
  leave(): Promise<void>;
  flush(): Promise<void>;
  transfers(): number;
  showLog?: () => void;
}
export const serverKey = (id: string) => "server:" + id;

export class DesktopEnvironments {
  private listeners = new Set<() => void>();
  private owners = new Map<string, WorkspaceCommands>();
  private access = new Map<string, Access>();
  private history = ["local"];
  private state = { active: "local", environments: [{ key: "local", name: "本机", status: "本机" }] as DesktopEnvironment[] };
  constructor(private transport: Transport) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private update(environments: DesktopEnvironment[], active = this.state.active) {
    this.state = { environments, active };
    this.listeners.forEach(fn => fn());
  }
  private patch(key: string, patch: Partial<DesktopEnvironment>) {
    if (this.find(key)) this.update(this.state.environments.map(item => item.key === key ? { ...item, ...patch } : item));
  }
  find(key: string) { return this.state.environments.find(item => item.key === key); }
  focus(key: string, id?: string) {
    const env = this.find(key);
    if (!env) return;
    this.history = [key, ...this.history.filter(previous => previous !== key)];
    this.update(this.state.environments, key);
    if (env.tabs && this.canEdit(env)) this.owners.get(key)?.select(id || env.tabs.activeId);
  }
  async connect(entry: ServerEntry, runtimeId = randomId()) {
    const key = serverKey(entry.id);
    const existing = this.state.environments.find(item => item.entry?.endpoint === entry.endpoint);
    if (existing && existing.key !== key) { this.focus(existing.key); return; }
    const previous = this.find(key);
    if (previous && (previous.closing || !previous.error)) { this.focus(key); return; }
    const pending = { key, entry, name: entry.name, runtimeId, status: "连接中", tabs: previous?.tabs ?? readRememberedTabs(entry) };
    if (previous) this.patch(key, { ...pending, error: undefined });
    else this.update([...this.state.environments, pending]);
    this.focus(key);
    try {
      const apiBase = await this.transport.connect(entry.endpoint, runtimeId);
      if (this.find(key)?.runtimeId === runtimeId) this.patch(key, { apiBase, status: "需要登录" });
      else await this.transport.disconnect(runtimeId);
    } catch (error) {
      if (this.find(key)?.runtimeId === runtimeId) this.patch(key, { status: "连接失败", error: String(error) });
    }
  }
  workspacePort(key: string): WorkspacePort {
    return { publish: (tabs, commands) => {
      const entry = this.find(key)?.entry;
      if (entry && tabs.enabled) rememberTabs(entry, tabs);
      this.owners.set(key, commands);
      this.patch(key, { tabs });
      return () => { if (this.owners.get(key) === commands) this.owners.delete(key); };
    } };
  }
  frame(env: DesktopEnvironment, shortcut: FramePort["shortcut"]): FramePort {
    const current = () => this.find(env.key)?.runtimeId === env.runtimeId;
    const entry = () => this.find(env.key)?.entry ?? env.entry!;
    return { get entry() { return entry(); }, runtimeId: env.runtimeId!, apiBase: env.apiBase!,
      shortcut: event => { if (current() && this.state.active === env.key && !this.find(env.key)?.closing) shortcut(event); },
      foreground: () => current() && this.state.active === env.key && !this.find(env.key)?.closing,
      publish: (tabs, commands) => current() ? this.workspacePort(env.key).publish(tabs, commands) : () => {},
      status: (status, leave, flush, transfers, showLog) => {
        if (!current()) return;
        this.access.set(env.key, { leave, flush, transfers, showLog });
        if (this.find(env.key)?.status !== status) this.patch(env.key, { status });
      },
    };
  }
  renameEntries(entries: ServerEntry[]) {
    this.update(this.state.environments.map(env => {
      const entry = env.entry && entries.find(item => item.id === env.entry?.id);
      return entry ? { ...env, name: entry.name, entry } : env;
    }));
  }
  canEdit(env: DesktopEnvironment) {
    return !env.closing && !!env.tabs?.enabled && this.owners.has(env.key) && (!env.entry || env.status === "已连接");
  }
  create(key: string) {
    const env = this.find(key);
    if (!env || !this.canEdit(env) || env.tabs!.items.length >= MAX_WORKSPACES) return;
    this.focus(key);
    this.owners.get(key)?.create();
  }
  commands(key: string) { const env = this.find(key); return env && this.canEdit(env) ? this.owners.get(key) : undefined; }
  showLog(key: string) { this.access.get(key)?.showLog?.(); }
  transferCount(key: string) { return this.access.get(key)?.transfers() ?? 0; }
  async flushAll() { await Promise.all(Array.from(this.access.values(), member => member.flush())); }
  async disconnect(key: string) {
    const env = this.find(key);
    if (!env?.runtimeId || env.closing) return;
    this.patch(key, { closing: true });
    try {
      await this.access.get(key)?.flush();
      await this.access.get(key)?.leave();
      await this.transport.disconnect(env.runtimeId);
      this.access.delete(key);
      this.owners.delete(key);
      this.history = this.history.filter(id => id !== key);
      const fallback = this.history.find(id => id === "local" || this.find(id)?.status === "已连接") ?? "local";
      const active = this.state.active === key ? fallback : this.state.active;
      this.update(this.state.environments.filter(item => item.key !== key), active);
    } catch (error) { this.patch(key, { closing: false }); throw error; }
  }
}
