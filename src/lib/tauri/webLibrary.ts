import { invoke } from "@tauri-apps/api/core";

export interface WebEntry { profileId: string; url: string; title: string; updatedAt: number }
export interface WebLibrary { history: WebEntry[]; bookmarks: WebEntry[] }
export type WebLibraryAction = { kind: "unbookmark" | "removeVisit"; url: string } | { kind: "visit" | "title"; url: string; title?: string } | { kind: "bookmark"; url: string; title: string } | { kind: "clearHistory" };
export const updateWebLibrary = (profileId: string, action?: WebLibraryAction) => invoke<WebLibrary>("web_library", { profileId, action: action ?? null });
