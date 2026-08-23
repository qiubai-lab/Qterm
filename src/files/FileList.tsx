import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "../components/Icon";
import type { FileEntry } from "../lib/tauri/files";
import { FILE_LIST_PADDING, FILE_ROW_HEIGHT, FILE_VIRTUALIZATION_THRESHOLD, formatPermissions, formatSize, type SortKey, type SortState, type VirtualRange } from "./fileBrowserModel";

export function FileSortHeader({ label, sortKey, sort, onChange }: { label: string; sortKey: SortKey; sort: SortState; onChange: (key: SortKey) => void }) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const action = direction === "ascending" ? "已升序，点击降序排列" : direction === "descending" ? "已降序，点击恢复默认排序" : "默认顺序，点击升序排列";
  return <button className="file-browser-sort-button" aria-label={`${label}，${action}`} aria-pressed={Boolean(direction)} data-sort-direction={direction ?? undefined} title={`${label}：${action}`} onClick={() => onChange(sortKey)}>
    <span>{label}</span><span className="file-sort-indicator" aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
  </button>;
}

export function FileList({ entries, range, ariaLabel, selectedPaths, onSelect, onOpen, onContextMenu, onContextMenuKey }: {
  entries: FileEntry[];
  range: VirtualRange;
  ariaLabel: string;
  selectedPaths: Set<string>;
  onSelect: (entry: FileEntry, additive: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, entry: FileEntry) => void;
  onContextMenuKey: (event: KeyboardEvent<HTMLButtonElement>, entry: FileEntry) => void;
}) {
  const virtualized = entries.length > FILE_VIRTUALIZATION_THRESHOLD;
  const start = virtualized ? Math.min(range.start, entries.length) : 0;
  const end = virtualized ? Math.min(Math.max(range.end, start), entries.length) : entries.length;
  const visibleEntries = entries.slice(start, end);
  return <div className={`file-list${virtualized ? " file-list-virtual" : ""}`} role="list" aria-label={ariaLabel} style={virtualized ? { height: entries.length * FILE_ROW_HEIGHT + FILE_LIST_PADDING * 2 } : undefined}>
    {visibleEntries.map((entry, visibleIndex) => {
      const index = start + visibleIndex;
      return <FileRow key={entry.path} entry={entry} selected={selectedPaths.has(entry.path)} selectionCount={selectedPaths.size} onSelect={(additive) => onSelect(entry, additive)} onOpen={() => onOpen(entry)} onContextMenu={(event) => onContextMenu(event, entry)} onContextMenuKey={(event) => onContextMenuKey(event, entry)} position={virtualized ? index : null} setSize={virtualized ? entries.length : undefined}/>;
    })}
  </div>;
}

function FileRow({ entry, selected, selectionCount, onSelect, onOpen, onContextMenu, onContextMenuKey, position, setSize }: { entry: FileEntry; selected: boolean; selectionCount: number; onSelect: (additive: boolean) => void; onOpen: () => void; onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void; onContextMenuKey: (event: KeyboardEvent<HTMLButtonElement>) => void; position: number | null; setSize?: number }) {
  return <button className="file-row" data-entry-kind={entry.isDirectory ? "directory" : "file"} data-entry-path={entry.path} data-selected={selected || undefined} role="listitem" aria-selected={selected} aria-posinset={position === null ? undefined : position + 1} aria-setsize={setSize} style={position === null ? undefined : { transform: `translateY(${FILE_LIST_PADDING + position * FILE_ROW_HEIGHT}px)` }} title={entry.path} onClick={(event) => {
    const additive = event.metaKey || event.ctrlKey;
    if (!additive && !entry.isDirectory && selected && selectionCount === 1) onOpen(); else onSelect(additive);
  }} onDoubleClick={() => { if (entry.isDirectory) onOpen(); }} onContextMenu={onContextMenu} onKeyDown={(event) => {
    onContextMenuKey(event);
    const additive = event.metaKey || event.ctrlKey;
    if (event.key === "Enter") { event.preventDefault(); if (additive) onSelect(true); else onOpen(); }
    if (event.key === " ") { event.preventDefault(); onSelect(additive); }
  }}>
    <span className="file-name"><Icon name={entry.isDirectory ? "files" : "file"} size={14}/><span>{entry.name}</span>{entry.isSymlink && <small>链接</small>}</span>
    <span>{entry.isDirectory ? "—" : formatSize(entry.size)}</span><span className="file-permission file-permission-column">{formatPermissions(entry.permissionMode)}</span><span>{entry.modifiedAt ? new Date(entry.modifiedAt * 1000).toLocaleString() : "—"}</span>
  </button>;
}
