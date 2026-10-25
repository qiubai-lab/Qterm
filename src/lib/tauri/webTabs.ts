import { invoke } from "@tauri-apps/api/core";
import { isDemo } from "../runtime/environment";

export interface SavedWebTab { id: string; address: string; title: string }
export interface SavedWebBlockTabs { blockId: string; profileId: string | null; selectedTabId: string; tabs: SavedWebTab[] }
export interface WebTabCache { blocks: SavedWebBlockTabs[] }

const native = () => !isDemo && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const loadWebTabCache = (): Promise<WebTabCache> => native() ? invoke("web_tab_cache", { cache: null }) : Promise.resolve({ blocks: [] });
export const saveWebTabCache = (cache: WebTabCache): Promise<unknown> => native() ? invoke("web_tab_cache", { cache }) : Promise.resolve();
