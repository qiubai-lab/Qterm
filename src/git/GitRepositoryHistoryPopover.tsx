import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { isSameGitRepository } from "../workspace/gitRepositoryHistory";
import type { GitRepositoryHistoryEntry } from "../workspace/model";

interface GitRepositoryHistoryPopoverProps {
  repositories: GitRepositoryHistoryEntry[];
  currentRepository: GitRepositoryHistoryEntry | null;
  triggerLabel: string;
  disabled?: boolean;
  onSelect: (repository: GitRepositoryHistoryEntry) => void;
  onBrowse: () => void;
}

interface GitRepositoryHistoryListProps {
  repositories: GitRepositoryHistoryEntry[];
  currentRepository: GitRepositoryHistoryEntry | null;
  onSelect: (repository: GitRepositoryHistoryEntry) => void;
  emptyMessage?: string;
  ariaLabel?: string;
}

interface PopoverPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

const popoverWidth = 340;
const viewportGutter = 8;
const anchorOffset = 4;

export function GitRepositoryHistoryPopover({
  repositories,
  currentRepository,
  triggerLabel,
  disabled = false,
  onSelect,
  onBrowse,
}: GitRepositoryHistoryPopoverProps) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const visiblePosition = disabled ? null : position;

  const restoreTriggerFocus = useCallback(() => {
    triggerRef.current?.focus();
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setPosition(null);
    if (restoreFocus) restoreTriggerFocus();
  }, [restoreTriggerFocus]);

  const open = useCallback(() => {
    if (disabled || !triggerRef.current) return;
    setPosition(fitPopover(triggerRef.current.getBoundingClientRect(), estimatePopoverHeight(repositories.length)));
  }, [disabled, repositories.length]);

  useEffect(() => {
    if (!disabled || !position) return;
    const closeFrame = window.requestAnimationFrame(() => setPosition(null));
    return () => window.cancelAnimationFrame(closeFrame);
  }, [disabled, position]);

  useLayoutEffect(() => {
    if (!visiblePosition || !triggerRef.current || !popoverRef.current) return;
    const next = fitPopover(triggerRef.current.getBoundingClientRect(), popoverRef.current.offsetHeight);
    if (next.left !== visiblePosition.left || next.top !== visiblePosition.top || next.placement !== visiblePosition.placement) setPosition(next);
  }, [visiblePosition, repositories.length]);

  useEffect(() => {
    if (!visiblePosition) return;
    const focusFirstAction = window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLButtonElement>("[data-repository-history-action]")?.focus();
    });
    const onOutsidePointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!popoverRef.current?.contains(node) && !triggerRef.current?.contains(node)) close();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    const onViewportChange = () => close();
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(focusFirstAction);
      document.removeEventListener("pointerdown", onOutsidePointer);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [close, visiblePosition]);

  function selectRepository(repository: GitRepositoryHistoryEntry) {
    onSelect(repository);
    close();
  }

  function browse() {
    onBrowse();
    close();
  }

  function navigate(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-repository-history-action]"));
    if (actions.length === 0) return;
    event.preventDefault();
    const currentIndex = actions.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") actions[0].focus();
    else if (event.key === "End") actions[actions.length - 1].focus();
    else if (event.key === "ArrowDown") actions[(currentIndex + 1 + actions.length) % actions.length].focus();
    else actions[(currentIndex - 1 + actions.length) % actions.length].focus();
  }

  return <>
    <ThemedTooltipButton
      anchorRef={triggerRef}
      type="button"
      className="git-repository-history-trigger"
      aria-label={triggerLabel}
      tooltip={triggerLabel}
      aria-haspopup="dialog"
      aria-expanded={Boolean(visiblePosition)}
      disabled={disabled}
      onClick={() => visiblePosition ? close() : open()}
    ><Icon name="files" size={13}/></ThemedTooltipButton>
    {visiblePosition && createPortal(<div
      ref={popoverRef}
      className="git-repository-history-popover"
      role="dialog"
      aria-labelledby={headingId}
      data-placement={visiblePosition.placement}
      style={{ left: visiblePosition.left, top: visiblePosition.top }}
      onKeyDown={navigate}
    >
      <header className="git-repository-history-header">
        <span id={headingId}>打开仓库</span>
        <small>最近仓库</small>
      </header>
      <div className="git-repository-history-scroll">
        <GitRepositoryHistoryList
          repositories={repositories}
          currentRepository={currentRepository}
          onSelect={selectRepository}
        />
      </div>
      <button type="button" className="git-repository-history-browse" data-repository-history-action onClick={browse}>
        <Icon name="folderPlus" size={13}/><span>浏览其他目录…</span>
      </button>
    </div>, document.body)}
  </>;
}

export function GitRepositoryHistoryList({
  repositories,
  currentRepository,
  onSelect,
  emptyMessage = "还没有成功打开的仓库",
  ariaLabel = "最近仓库",
}: GitRepositoryHistoryListProps) {
  if (repositories.length === 0) return <div className="git-repository-history-empty">{emptyMessage}</div>;
  return <div className="git-repository-history-list" role="list" aria-label={ariaLabel}>
    {repositories.map((repository) => {
      const current = currentRepository ? isSameGitRepository(repository, currentRepository) : false;
      const name = repositoryName(repository.path);
      return <div role="listitem" key={repositoryKey(repository)}>
        <button
          type="button"
          className="git-repository-history-item"
          aria-current={current ? "true" : undefined}
          aria-label={`${name}，${repository.path}${current ? "，当前" : ""}`}
          title={repository.path}
          data-repository-history-action
          onClick={() => onSelect(repository)}
        >
          <Icon name="git" size={13}/>
          <span><strong>{name}</strong><small>{repository.path}</small></span>
          {current && <em>当前</em>}
        </button>
      </div>;
    })}
  </div>;
}

function fitPopover(anchor: DOMRect, height: number): PopoverPosition {
  const width = Math.min(popoverWidth, window.innerWidth - viewportGutter * 2);
  const left = Math.max(viewportGutter, Math.min(anchor.right - width, window.innerWidth - width - viewportGutter));
  const below = anchor.bottom + anchorOffset;
  if (below + height <= window.innerHeight - viewportGutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(viewportGutter, anchor.top - height - anchorOffset), placement: "above" };
}

function estimatePopoverHeight(repositoryCount: number): number {
  return 70 + Math.max(1, Math.min(repositoryCount, 8)) * 42;
}

function repositoryName(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, "");
  return normalized.split(/[\\/]/u).pop() || path;
}

function repositoryKey(repository: GitRepositoryHistoryEntry): string {
  return repository.type === "local"
    ? `local\0${repository.path}`
    : `remote\0${repository.profileId}\0${repository.path}`;
}
