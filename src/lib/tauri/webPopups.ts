import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface WebPopupRequest { label: string; requestId: string; url: string }
export interface WebPopupEvent { label: string; requestId: string | null; url: string; message: string | null }
export const acceptWebPopup = (id: string, request: string) => invoke<void>("web_accept_popup", { id, request });
export const rejectWebPopup = (request: string) => invoke<void>("web_reject_popup", { request });
export const listenWebPopups = (receive: (event: WebPopupEvent) => void) => listen<WebPopupEvent>("web-popup", event => receive(event.payload));
export const listenWebWindowClose = (receive: (label: string) => void) => listen<string>("web-window-close", event => receive(event.payload));
