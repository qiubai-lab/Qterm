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
  private waiting = new Map<string, DesktopEnvironment>();
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
    void this.startWaiting(key);
    this.history = [key, ...this.history.filter(previous => previous !== key)];
    const commands = this.commands(key);
    const tabId = id && env.tabs?.items.some(tab => tab.id === id) ? id : env.tabs?.activeId;
    if (commands && env.tabs && tabId && env.tabs.activeId !== tabId) {
      const tabs = { ...env.tabs, activeId: tabId };
      this.update(this.state.environments.map(item => item === env ? { ...env, tabs } : item), key);
    } else if (this.state.active !== key) {
      this.update(this.state.environments, key);
    }
    if (commands && tabId) commands.select(tabId);
  }
  async connect(entry: ServerEntry, runtimeId = randomId()) {
    const key = serverKey(entry.id);
    const existing = this.state.environments.find(item => item.entry?.endpoint === entry.endpoint);
    if (existing && existing.key !== key) { this.focus(existing.key); return; }
    const previous = this.find(key);
    if (previous && (previous.closing || !previous.error)) { this.focus(key); return; }
    const pending = this.reserve(entry, runtimeId);
    this.focus(key);
    await this.open(pending);
  }

  private reserve(entry: ServerEntry, runtimeId: string) {
    const key = serverKey(entry.id);
    const previous = this.find(key);
    const pending = { key, entry, name: entry.name, runtimeId, status: "连接中", tabs: previous?.tabs ?? readRememberedTabs(entry) };
    if (previous) this.patch(key, { ...pending, error: undefined });
    else this.update([...this.state.environments, pending]);
    return pending;
  }

  async restore(members: { entry: ServerEntry; runtimeId: string }[], active: string) {
    for (const { entry, runtimeId } of members) {
      if (this.state.environments.some(env => env.entry?.endpoint === entry.endpoint || env.key === serverKey(entry.id))) continue;
      const env = this.reserve(entry, runtimeId);
      this.waiting.set(env.key, env);
    }
    this.focus(this.find(active) ? active : "local");
    for (const key of this.waiting.keys()) {
      await new Promise(resolve => setTimeout(resolve, 180));
      await this.startWaiting(key);
    }
  }

  private startWaiting(key: string) {
    const env = this.waiting.get(key);
    if (!env || this.find(key)?.closing) return;
    this.waiting.delete(key);
    return this.open(env);
  }

  private async open(env: DesktopEnvironment) {
    const { key, runtimeId, entry } = env;
    if (!entry || !runtimeId) return;
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
      const previous = this.find(key)?.tabs;
      const sameItems = previous?.items === tabs.items || (previous?.items.length === tabs.items.length && tabs.items.every((item, index) => {
        const prior = previous.items[index];
        return prior.id === item.id && prior.name === item.name && prior.unread === item.unread;
      }));
      if (previous?.activeId !== tabs.activeId || previous.enabled !== tabs.enabled || !sameItems) {
        this.patch(key, { tabs });
      }
      return () => { if (this.owners.get(key) === commands) this.owners.delete(key); };
    } };
  }
  frame(env: DesktopEnvironment, shortcut: FramePort["shortcut"]): FramePort {
    const current = () => this.find(env.key)?.runtimeId === env.runtimeId;
    const entry = () => this.find(env.key)?.entry ?? env.entry!;
    return { get entry() { return entry(); }, runtimeId: env.runtimeId!, apiBase: env.apiBase!,
      shortcut: event => { if (current() && this.state.active === env.key && !this.find(env.key)?.closing) shortcut(event); },
      subscribe: this.subscribe,
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
      this.waiting.delete(key);
      this.access.delete(key);
      this.owners.delete(key);
      this.history = this.history.filter(id => id !== key);
      const fallback = this.history.find(id => id === "local" || this.find(id)?.status === "已连接") ?? "local";
      const active = this.state.active === key ? fallback : this.state.active;
      this.update(this.state.environments.filter(item => item.key !== key), active);
    } catch (error) { this.patch(key, { closing: false }); throw error; }
  }
}
