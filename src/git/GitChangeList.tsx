import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../components/Icon";
import type { GitChange } from "../lib/tauri/git";
import {
  GIT_CHANGE_ROW_HEIGHT,
  GIT_CHANGE_VIRTUAL_THRESHOLD,
  gitChangeVirtualFallbackRange,
  gitChangeVirtualRange,
} from "./gitChangeListModel";
import { presentGitFileStatus } from "./gitStatus";

export interface GitChangeListProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  title: string;
  changes: GitChange[];
  actionLabel: string;
  actionIcon: IconName;
  showActionText?: boolean;
  onAction: (change: GitChange) => void;
  onPreview?: (change: GitChange) => void;
  selectedPaths?: ReadonlySet<string>;
  onSelect?: (change: GitChange, index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenContextMenu?: (change: GitChange, index: number, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLButtonElement>) => void;
}

export function GitChangeList({ scrollContainerRef, title, changes, actionLabel, actionIcon, showActionText = false, onAction, onPreview, selectedPaths, onSelect, onOpenContextMenu }: GitChangeListProps) {
  const virtualized = changes.length > GIT_CHANGE_VIRTUAL_THRESHOLD;
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => gitChangeVirtualFallbackRange(changes.length));
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(null);
  const [selectionHint, setSelectionHint] = useState<{ id: number; path: string; target: HTMLButtonElement } | null>(null);
  const selectionHintId = useId();
  const hintSequence = useRef(0);
  const hintTimer = useRef<number | null>(null);

  const updateRange = useCallback(() => {
    if (!virtualized || !scrollContainerRef.current || !listRef.current) return;
    const viewportBounds = scrollContainerRef.current.getBoundingClientRect();
    const listBounds = listRef.current.getBoundingClientRect();
    const next = gitChangeVirtualRange({
      count: changes.length,
      listTop: listBounds.top,
      viewportTop: viewportBounds.top,
      viewportHeight: scrollContainerRef.current.clientHeight || viewportBounds.height,
    });
    setRange((current) => current.start === next.start && current.end === next.end ? current : next);
  }, [changes.length, scrollContainerRef, virtualized]);

  useLayoutEffect(() => {
    if (virtualized) updateRange();
  });

  useEffect(() => {
    if (!virtualized) return;
    const scrollContainer = scrollContainerRef.current;
    const list = listRef.current;
    if (!scrollContainer || !list) return;
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateRange);
    resizeObserver?.observe(scrollContainer);
    resizeObserver?.observe(list);
    scrollContainer.addEventListener("scroll", updateRange, { passive: true });
    window.addEventListener("resize", updateRange);
    return () => {
      resizeObserver?.disconnect();
      scrollContainer.removeEventListener("scroll", updateRange);
      window.removeEventListener("resize", updateRange);
    };
  }, [scrollContainerRef, updateRange, virtualized]);

  function clearSelectionHint() {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = null;
    setSelectionHint(null);
  }

  function showSelectionHint(path: string, target: HTMLButtonElement) {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    const id = ++hintSequence.current;
    setSelectionHint({ id, path, target });
    hintTimer.current = window.setTimeout(() => {
      setSelectionHint((current) => current?.id === id ? null : current);
      hintTimer.current = null;
    }, 1800);
  }

  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
  }, []);

  useEffect(() => {
    if (!selectionHint) return;
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") clearSelectionHint();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [selectionHint]);

  const visibleStart = virtualized ? Math.min(range.start, changes.length) : 0;
  const visibleEnd = virtualized ? Math.min(Math.max(range.end, visibleStart), changes.length) : changes.length;
  const visibleChanges = changes.slice(visibleStart, visibleEnd);
  const listStyle = virtualized ? { height: changes.length * GIT_CHANGE_ROW_HEIGHT } as CSSProperties : undefined;

  return <section className="git-change-group" aria-label={title}>
    <div className="git-change-group-title">{title}<span>{changes.length}</span></div>
    <div ref={listRef} className={`git-change-list${virtualized ? " virtualized" : ""}`} role="list" aria-label={`${title}文件`} aria-setsize={changes.length} style={listStyle}>
      {visibleChanges.map((change, visibleIndex) => {
        const index = visibleStart + visibleIndex;
        return <GitChangeRow
          key={`${change.path}:${change.staged}:${change.status}`}
          change={change}
          index={index}
          count={changes.length}
          virtualized={virtualized}
          selected={selectedPaths ? selectedPaths.has(change.path) : localSelectedPath === change.path}
          actionLabel={actionLabel}
          actionIcon={actionIcon}
          showActionText={showActionText}
          selectionHintId={selectionHint?.path === change.path ? selectionHintId : undefined}
          onAction={onAction}
          onPreview={onPreview}
          onSelect={onSelect}
          onOpenContextMenu={onOpenContextMenu}
          onLocalSelect={setLocalSelectedPath}
          onClearSelectionHint={clearSelectionHint}
          onShowSelectionHint={showSelectionHint}
        />;
      })}
    </div>
    {selectionHint && <GitChangeSelectionHint id={selectionHintId} feedback={selectionHint}/>}
  </section>;
}

function GitChangeRow({ change, index, count, virtualized, selected, actionLabel, actionIcon, showActionText, selectionHintId, onAction, onPreview, onSelect, onOpenContextMenu, onLocalSelect, onClearSelectionHint, onShowSelectionHint }: {
  change: GitChange;
  index: number;
  count: number;
  virtualized: boolean;
  selected: boolean;
  actionLabel: string;
  actionIcon: IconName;
  showActionText: boolean;
  selectionHintId?: string;
  onAction: (change: GitChange) => void;
  onPreview?: (change: GitChange) => void;
  onSelect?: (change: GitChange, index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenContextMenu?: (change: GitChange, index: number, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLButtonElement>) => void;
  onLocalSelect: (path: string) => void;
  onClearSelectionHint: () => void;
  onShowSelectionHint: (path: string, target: HTMLButtonElement) => void;
}) {
  const status = presentGitFileStatus(change.status, { conflict: change.conflict });
  const previewable = Boolean(onPreview && !change.submodule);
  const submoduleStatus = change.submodule
    ? [change.submodule.commitChanged ? "引用变化" : null, change.submodule.trackedModified ? "内部修改" : null, change.submodule.untrackedContent ? "内部未跟踪" : null].filter(Boolean).join(" · ")
    : null;
  const actionDisabled = Boolean(!change.staged && change.submodule && !change.submodule.commitChanged);
  const style = virtualized ? { transform: `translateY(${index * GIT_CHANGE_ROW_HEIGHT}px)` } : undefined;
  return <div className={`git-change-row${previewable ? " previewable" : ""}`} role="listitem" aria-posinset={virtualized ? index + 1 : undefined} aria-setsize={virtualized ? count : undefined} data-selected={selected || undefined} style={style} title={change.originalPath ? `${change.originalPath} → ${change.path}` : change.path} onContextMenu={onOpenContextMenu ? (event) => onOpenContextMenu(change, index, event) : undefined}>
    {previewable ? <button type="button" className="git-change-preview-trigger" aria-label={`预览${change.staged ? "已暂存" : "工作区"}更改 ${change.path}`} aria-pressed={selected} aria-describedby={selectionHintId} onClick={(event) => {
      const modifiedSelection = event.ctrlKey || event.metaKey || event.shiftKey;
      onSelect?.(change, index, event);
      if (!selected) onLocalSelect(change.path);
      if (modifiedSelection) onClearSelectionHint();
      else if (selected) { onClearSelectionHint(); onPreview?.(change); }
      else onShowSelectionHint(change.path, event.currentTarget);
    }} onKeyDown={onOpenContextMenu ? (event) => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") onOpenContextMenu(change, index, event); } : undefined}><Icon name="file" size={13}/><span className="git-change-path">{change.path}</span><span className="git-change-status" title={`Git 状态：${status.label}`}>{status.label}</span></button> : <><Icon name={change.conflict ? "mergeConflict" : "git"} size={13}/><span className="git-change-path">{change.path}</span><span className={`git-change-status${change.conflict ? " conflict" : ""}`} title={submoduleStatus ?? `Git 状态：${status.label}`}>{submoduleStatus ?? status.label}</span></>}
    <button type="button" className={showActionText ? "git-conflict-action" : undefined} aria-label={`${actionLabel} ${change.path}`} title={actionDisabled ? "子仓库内部修改不会改变父仓库 gitlink" : actionLabel} disabled={actionDisabled} onClick={() => onAction(change)}><Icon name={actionIcon} size={11}/>{showActionText && <span>解决</span>}</button>
  </div>;
}

function GitChangeSelectionHint({ id, feedback }: { id: string; feedback: { id: number; path: string; target: HTMLButtonElement } }) {
  const [position, setPosition] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  useEffect(() => {
    function updatePosition() {
      if (!feedback.target.isConnected) { setPosition(null); return; }
      const rect = feedback.target.getBoundingClientRect();
      const placement = rect.bottom + 38 > window.innerHeight ? "above" : "below";
      setPosition({
        left: Math.max(8, Math.min(rect.left + 10, window.innerWidth - 206)),
        top: placement === "above" ? Math.max(8, rect.top - 6) : Math.min(window.innerHeight - 8, rect.bottom + 6),
        placement,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [feedback]);

  if (!position) return null;
  return createPortal(<p id={id} className="git-change-selection-hint" data-placement={position.placement} role="status" aria-live="polite" aria-atomic="true" style={{ left: position.left, top: position.top }}>已选择，再次点击打开预览</p>, document.body);
}
