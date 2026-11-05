import { watchBrowserResume } from "./browserResume";
import { vaultStatus } from "./vaultStatus";
import { pauseData } from "./dataAccess";
import { accessProof } from "./accessIdentity";
import { API, api, AUTH_EXPIRED } from "./http";

/** Presence belongs to the page, not to any particular PTY or workspace block. */
export function openAccessPresence(onReady: () => void, onDisconnected: () => void) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: number | undefined;
  let timeout: number | undefined;
  let generation = 0;
  const unwatch = watchBrowserResume(restart);
  function restart() {
    if (stopped) return;
    const currentGeneration = ++generation;
    window.clearTimeout(retry); window.clearTimeout(timeout);
    const previous = socket; socket = undefined;
    previous?.close();
    onDisconnected();
    retry = window.setTimeout(() => {
      void api("/auth").then(() => {
        if (!stopped && generation === currentGeneration) connect();
      }).catch(() => {
        if (!stopped && generation === currentGeneration) retry = window.setTimeout(connect, 3000);
      });
    }, 250);
  }
  function connect() {
    if (stopped) return;
    const url = new URL(`${API}/access`,location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    timeout = window.setTimeout(() => current.close(),10000);
    current.onopen = () => { if (!stopped && socket === current) current.send(JSON.stringify(accessProof())); };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      try {
        const value = JSON.parse(String(event.data));
        if (value.type === "vaultStatus") vaultStatus.receive(value.status);
        if (value.type === "ready") { vaultStatus.beginConnection(); window.clearTimeout(timeout);onReady(); }
        if (value.type === "terminalLock" && value.locked === true) pauseData();
        if (value.type === "revoked") {
          stop();
          window.dispatchEvent(new CustomEvent(AUTH_EXPIRED,{detail:value.reason === "sessionReplaced" ? "sessionReplaced" : "unauthorized"}));
        }
      } catch { current.close(); }
    };
    current.onclose = () => {
      if (stopped || socket !== current) return;
      restart();
    };
    current.onerror = () => { /* onclose owns bounded retries; revoked access never retries. */ };
  }
  function stop() {
    stopped = true;
    unwatch();
    window.clearTimeout(retry);window.clearTimeout(timeout);
    socket?.close();
  }
  connect();
  return stop;
}
