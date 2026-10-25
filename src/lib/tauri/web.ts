import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface WebClipRect { x: number; y: number; width: number; height: number }
export interface WebFrame extends WebClipRect { radius: number; stroke: number; color: [number, number, number, number] }
export interface WebPanel { edge: WebFrame; background: [number, number, number, number] }
export type WebScrollbarTheme = [WebFrame["color"], WebFrame["color"], WebFrame["color"]];
export interface WebBounds extends WebClipRect { visible: boolean; inputBlocked?: boolean; covered?: boolean; occlusions?: WebClipRect[]; frame?: WebFrame | null; panels?: WebPanel[]; scrollbar?: WebScrollbarTheme }
export interface WebSnapshot { url: string; png: string }
export const captureWeb = (id: string) => invoke<WebSnapshot>("web_snapshot", { id });
export type WebLoadState = "idle" | "loading" | "loaded" | "failed" | "stopped";
export interface WebMetrics { url: string; documentId: number; resources: number; loadMs: number }
export interface WebPageState { label: string; url: string; loading: boolean; visited: boolean; title?: string; metadata?: boolean; loadState?: WebLoadState; error?: string }
export const readWebMetrics = (id: string) => invoke<WebMetrics | null>("web_metrics", { id });
export const openWeb = (id: string, sessionId: string | null, profileId: string | null, url: string) => {
  if (profileId !== null && !sessionId) return Promise.reject(new Error("SSH 尚未连接"));
  if (profileId === null && sessionId !== null) return Promise.reject(new Error("浏览连接身份无效"));
  const target = profileId === null ? { type: "local" } : { type: "remote", sessionId, profileId };
  return invoke<void>("web_open", { input: { id, target, url } });
};
export const closeWeb = (id: string) => invoke<void>("web_close", { id });
export const syncWeb = (id: string, bounds: WebBounds) => invoke<void>("web_sync", { id, bounds });
export const webAction = (id: string, action: "navigate" | "back" | "forward" | "reload" | "stop", url?: string) => invoke<void>("web_action", { id, action, url });
export const listenWebPages = (receive: (page: WebPageState) => void) => listen<WebPageState>("web-page-state", event => receive(event.payload));
export const listenWebFocus = (receive: (label: string) => void) => listen<string>("web-guest-focused", event => receive(event.payload));

export interface WebDataSelection { cache: boolean; cookies: boolean; storage: boolean }
export const clearWebData = (id: string, selection: WebDataSelection) => invoke<void>("web_clear_data", { id, selection });
