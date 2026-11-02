import type { GitObservationTarget } from "../lib/contracts/gitObservation";
import type { GitSnapshot } from "../lib/tauri/git";
import { accessProof } from "./accessIdentity";
import { dataLease, dataPaused, subscribeDataAccess } from "./dataAccess";
import { API, api, RequestError } from "./http";

type Read = () => Promise<GitSnapshot>;
type Listener = (read: Read) => void;
interface Entry {
  id: string;
  target: GitObservationTarget;
  revision: number;
  listeners: Set<Listener>;
  read?: Read;
  retry?: ReturnType<typeof setTimeout>;
}

/** One data socket per page; all panes share each repository's invalidations and HTTP read. */
export function createGitObservationTransport() {
  const entries = new Map<string, Entry>();
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
  let stopActivity: (() => void) | undefined;
  const key = (target: GitObservationTarget) => JSON.stringify(target.kind === "local"
    ? [target.kind, target.path] : [target.kind, target.sessionId, target.profileId, target.path]);
  function stop() {
    clearTimeout(retry); clearTimeout(timeout);
    for (const entry of entries.values()) { clearTimeout(entry.retry); entry.read = undefined; }
    const current = socket; socket = undefined; current?.close();
  }
  function send(value: unknown) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
  }
  function notifyFailure(message: string) {
    for (const entry of entries.values()) {
      entry.read = () => Promise.reject(new Error(message));
      for (const listener of entry.listeners) listener(entry.read);
    }
  }
  function connect() {
    if (socket || dataPaused() || !entries.size) return;
    const lease = dataLease();
    const url = new URL(`${API}/git/events`, location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url); socket = current;
    timeout = setTimeout(() => current.close(), 15000);
    current.onopen = () => {
      if (socket !== current || lease.signal.aborted) { current.close(); return; }
      clearTimeout(timeout);
      send({ version: 1, ...accessProof() });
      for (const entry of entries.values()) {
        entry.revision = 0; entry.read = undefined;
        send({ type: "subscribe", id: entry.id, target: entry.target });
      }
    };
    current.onmessage = event => {
      if (socket !== current || lease.signal.aborted || dataPaused()) return;
      try {
        const value = JSON.parse(String(event.data));
        if (value.type === "error") { notifyFailure(value.error?.message ?? "仓库订阅暂时不可用"); current.close(); return; }
        const entry = [...entries.values()].find(item => item.id === value.id);
        if (!entry) return;
        if (value.type === "subscriptionError") {
          entry.read = () => Promise.reject(new RequestError(value.error?.code ?? "subscriptionFailed", value.error?.message ?? "仓库订阅暂时不可用", 400));
          for (const listener of entry.listeners) listener(entry.read);
          clearTimeout(entry.retry);
          entry.retry = setTimeout(() => {
            if (socket === current && entries.get(key(entry.target)) === entry && !lease.signal.aborted)
              send({ type: "subscribe", id: entry.id, target: entry.target });
          }, 5000);
          return;
        }
        if (value.type !== "repositoryChanged" || !Number.isSafeInteger(value.revision)
          || value.revision < 1 || value.revision <= entry.revision) return;
        clearTimeout(entry.retry);
        entry.revision = value.revision;
        let pending: Promise<GitSnapshot> | undefined;
        const check = () => {
          lease.check();
          if (socket !== current || entries.get(key(entry.target)) !== entry) throw new Error("仓库订阅已更新");
        };
        const read: Read = async () => {
          check();
          pending ??= api<GitSnapshot>("/git/observations/snapshot", "POST", { target: entry.target, revision: value.revision })
            .then(snapshot => { check(); return snapshot; })
            .catch(error => { pending = undefined; throw error; });
          return pending;
        };
        entry.read = read;
        for (const listener of entry.listeners) listener(read);
      } catch { current.close(); }
    };
    current.onerror = () => { /* close owns retries */ };
    current.onclose = () => {
      if (socket !== current) return;
      socket = undefined; clearTimeout(timeout);
      for (const entry of entries.values()) clearTimeout(entry.retry);
      if (!dataPaused() && entries.size) {
        notifyFailure("仓库订阅连接中断，正在恢复…");
        retry = setTimeout(connect, 1000);
      }
    };
  }
  return {
    subscribe(target: GitObservationTarget, listener: Listener) {
      const id = key(target);
      let entry = entries.get(id);
      if (!entry) {
        entry = { id: crypto.randomUUID(), target, revision: 0, listeners: new Set() };
        entries.set(id, entry);
        send({ type: "subscribe", id: entry.id, target });
      }
      entry.listeners.add(listener);
      if (entry.read) listener(entry.read);
      stopActivity ??= subscribeDataAccess(() => { if (dataPaused()) stop(); else connect(); });
      connect();
      return () => {
        entry.listeners.delete(listener);
        if (!entry.listeners.size) {
          clearTimeout(entry.retry); entries.delete(id);
          send({ type: "unsubscribe", id: entry.id });
        }
        if (!entries.size) { stop(); stopActivity?.(); stopActivity = undefined; }
      };
    },
  };
}
