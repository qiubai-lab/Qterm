import type { FileEntry } from "../lib/tauri/files";
import { editorLanguageForFileName, type EditorLanguage } from "../editor/editorLanguage";

export type PreviewKind = EditorLanguage | "image";
export type SortKey = "name" | "size" | "modifiedAt";
export type SortDirection = "ascending" | "descending";
export type SortState = { key: SortKey; direction: SortDirection } | null;
export type VirtualRange = { start: number; end: number };

export const FILE_LIST_PADDING = 3;
export const FILE_ROW_HEIGHT = 27;
export const FILE_VIRTUALIZATION_THRESHOLD = 200;
export const FILE_VIRTUAL_OVERSCAN = 8;
export const FILE_VIRTUAL_FALLBACK_ROWS = 20;
const FILE_HEADER_HEIGHT = 25;

export function fileVirtualRange(scrollTop: number, clientHeight: number, entryCount: number): VirtualRange {
  if (entryCount <= FILE_VIRTUALIZATION_THRESHOLD) return { start: 0, end: entryCount };
  const visibleStart = Math.min(entryCount - 1, Math.max(0, Math.floor((scrollTop - FILE_LIST_PADDING) / FILE_ROW_HEIGHT)));
  const viewportRows = clientHeight > FILE_HEADER_HEIGHT
    ? Math.ceil((clientHeight - FILE_HEADER_HEIGHT) / FILE_ROW_HEIGHT)
    : FILE_VIRTUAL_FALLBACK_ROWS;
  return {
    start: Math.max(0, visibleStart - FILE_VIRTUAL_OVERSCAN),
    end: Math.min(entryCount, visibleStart + viewportRows + FILE_VIRTUAL_OVERSCAN + 1),
  };
}

export function fileListAnchor(scrollTop: number, entries: FileEntry[]): { path: string; offset: number } | null {
  if (entries.length === 0) return null;
  const index = Math.min(entries.length - 1, Math.max(0, Math.floor((scrollTop - FILE_LIST_PADDING) / FILE_ROW_HEIGHT)));
  return { path: entries[index].path, offset: FILE_LIST_PADDING + index * FILE_ROW_HEIGHT - scrollTop };
}

export function previewKindFor(name: string): PreviewKind {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "image";
  return editorLanguageForFileName(name);
}

export function imageMime(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension ?? "png"}`;
}

const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortEntries(entries: FileEntry[], sort: SortState): FileEntry[] {
  if (!sort) return entries;
  const factor = sort.direction === "ascending" ? 1 : -1;
  return entries.map((entry, index) => ({ entry, index })).sort((left, right) => {
    if (left.entry.isDirectory !== right.entry.isDirectory) return left.entry.isDirectory ? -1 : 1;
    if (sort.key === "modifiedAt") {
      if (left.entry.modifiedAt === null && right.entry.modifiedAt !== null) return 1;
      if (left.entry.modifiedAt !== null && right.entry.modifiedAt === null) return -1;
    }
    const comparison = sort.key === "name"
      ? fileNameCollator.compare(left.entry.name, right.entry.name)
      : sort.key === "size"
        ? left.entry.size - right.entry.size
        : (left.entry.modifiedAt ?? 0) - (right.entry.modifiedAt ?? 0);
    return comparison === 0 ? left.index - right.index : comparison * factor;
  }).map(({ entry }) => entry);
}

export function formatPermissions(mode: number | null | undefined): string {
  if (mode == null) return "—";
  const value = mode & 0o7777;
  const execute = (bit: number, special: number, active: string, inactive: string) => value & special ? value & bit ? active : inactive : value & bit ? "x" : "-";
  return [
    value & 0o400 ? "r" : "-", value & 0o200 ? "w" : "-", execute(0o100, 0o4000, "s", "S"),
    value & 0o040 ? "r" : "-", value & 0o020 ? "w" : "-", execute(0o010, 0o2000, "s", "S"),
    value & 0o004 ? "r" : "-", value & 0o002 ? "w" : "-", execute(0o001, 0o1000, "t", "T"),
  ].join("");
}

export function fitContextMenu(anchorX: number, anchorY: number, menuWidth: number, menuHeight: number, viewportWidth: number, viewportHeight: number) {
  const gap = 6;
  const maxLeft = Math.max(gap, viewportWidth - menuWidth - gap);
  const maxTop = Math.max(gap, viewportHeight - menuHeight - gap);
  const placement = anchorY + menuHeight + gap > viewportHeight ? "above" : "below";
  const preferredTop = placement === "above" ? anchorY - menuHeight : anchorY;
  return {
    x: Math.min(Math.max(anchorX, gap), maxLeft),
    y: Math.min(Math.max(preferredTop, gap), maxTop),
    placement,
  } as const;
}

export function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} - 副本${name.slice(dot)}` : `${name} - 副本`;
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function fileErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : "文件操作失败";
}
