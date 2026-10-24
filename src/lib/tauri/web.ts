import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface WebClipRect { x: number; y: number; width: number; height: number }
export interface WebFrame extends WebClipRect { radius: number; stroke: number; color: [number, number, number, number] }
export interface WebBounds extends WebClipRect { visible: boolean; occlusions?: WebClipRect[]; frame?: WebFrame | null }
export interface WebPageState { label: string; url: string; loading: boolean }
export const openWeb = (id: string, sessionId: string, profileId: string, url: string) => invoke<void>("web_open", { input: { id, sessionId, profileId, url } });
export const closeWeb = (id: string) => invoke<void>("web_close", { id });
export const syncWeb = (id: string, bounds: WebBounds) => invoke<void>("web_sync", { id, bounds });
export const webAction = (id: string, action: "navigate" | "back" | "forward" | "reload", url?: string) => invoke<void>("web_action", { id, action, url });
export const listenWebPages = (receive: (page: WebPageState) => void) => listen<WebPageState>("web-page-state", event => receive(event.payload));
export const listenWebFocus = (receive: (label: string) => void) => listen<string>("web-guest-focused", event => receive(event.payload));
