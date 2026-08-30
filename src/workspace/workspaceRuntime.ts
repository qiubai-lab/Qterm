import type { NetworkRuleRuntimeState } from "../lib/tauri/network";
import type { SessionEvent, SessionNode, SessionState } from "../lib/tauri/sessions";
import type { ConnectionRouteProgressState } from "./connectionProgress";

export type ConnectionOwner = "terminal" | "files" | "network" | "git";

export interface HostKeyPrompt {
  node: SessionNode;
  algorithm: string;
  fingerprint: string;
}

export interface TerminalRuntime {
  sessionId: string | null;
  kind: "local" | "ssh" | null;
  status: SessionState;
  hostKeyPrompt: HostKeyPrompt | null;
  notice: string;
  connectionProgress: ConnectionRouteProgressState | null;
  initialCwd: string | null;
  cwd: string | null;
  cwdSource: "initial" | "osc7" | null;
}

export interface FileRuntime {
  sessionId: string | null;
  kind: "local" | "sftp";
  status: SessionState;
  hostKeyPrompt: HostKeyPrompt | null;
  notice: string;
  connectionProgress: ConnectionRouteProgressState | null;
}

export interface NetworkRuntime {
  sessionId: string | null;
  status: SessionState;
  hostKeyPrompt: HostKeyPrompt | null;
  notice: string;
  connectionProgress: ConnectionRouteProgressState | null;
  ruleStates: Record<string, NetworkRuleRuntimeState>;
}

export interface GitRuntime {
  sessionId: string | null;
  status: SessionState;
  hostKeyPrompt: HostKeyPrompt | null;
  notice: string;
  connectionProgress: ConnectionRouteProgressState | null;
  stale: boolean;
}

export const defaultRuntime: TerminalRuntime = { sessionId: null, kind: null, status: "closed", hostKeyPrompt: null, notice: "", connectionProgress: null, initialCwd: null, cwd: null, cwdSource: null };
export const defaultFileRuntime: FileRuntime = { sessionId: null, kind: "local", status: "connected", hostKeyPrompt: null, notice: "", connectionProgress: null };
export const defaultNetworkRuntime: NetworkRuntime = { sessionId: null, status: "closed", hostKeyPrompt: null, notice: "", connectionProgress: null, ruleStates: {} };
export const defaultGitRuntime: GitRuntime = { sessionId: null, status: "closed", hostKeyPrompt: null, notice: "", connectionProgress: null, stale: false };
export const MAX_PENDING_TERMINAL_OUTPUT = 256 * 1024;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function workspaceErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : "操作失败";
}

export function epochKey(blockId: string, epoch: number): string {
  return `${blockId}:${epoch}`;
}

export function consumeFailureHandler(handlers: Map<string, () => void>, key: string) {
  const handler = handlers.get(key);
  if (!handler) return;
  handlers.delete(key);
  handler();
}

export function terminalFailureKey(blockId: string, epoch: number): string {
  return `terminal:${blockId}:${epoch}`;
}

export function deleteFailureHandlers(handlers: Map<string, () => void>, prefix: string) {
  for (const key of handlers.keys()) {
    if (key.startsWith(prefix)) handlers.delete(key);
  }
}

export function connectionIntentKey(owner: ConnectionOwner, blockId: string): string {
  return `${owner}:${blockId}`;
}

export function connectionIntentAllows(intents: Map<string, string | null>, owner: ConnectionOwner, blockId: string, profileId: string | null): boolean {
  const key = connectionIntentKey(owner, blockId);
  return !intents.has(key) || intents.get(key) === profileId;
}

export function nodeLabel(node: Extract<SessionEvent, { type: "routeProgress" }>["node"]): string {
  return `${node.role === "jump" ? "跳板" : "目标"}“${node.name}”（${node.host}:${node.port}）`;
}

export function routeFailureNotice(event: Extract<SessionEvent, { type: "failed" }>): string {
  return event.node ? `${nodeLabel(event.node)}：${event.message}` : event.message;
}
