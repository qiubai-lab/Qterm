import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { HostIdentity } from "../components/HostIdentity";
import { ExactTextInput } from "../components/ExactTextInput";
import type { ConnectionProfile, ProfileGroup } from "../lib/tauri/profiles";
import type { SessionState } from "../lib/tauri/sessions";

interface TerminalTargetPickerProps {
  profiles: ConnectionProfile[];
  groups?: ProfileGroup[];
  recentProfileIds?: string[];
  selectedProfileId: string | null;
  status: SessionState;
  detail: string;
  onSelect: (profileId: string | null) => void;
  onManageConnections?: () => void;
  icon?: IconName;
  localName?: string;
  localDetail?: string;
  ariaContext?: string;
  allowLocal?: boolean;
  hideDetail?: boolean;
  localAttention?: boolean;
  onRequestDisconnect?: () => void;
  statusAction?: {
    label: string;
    icon: IconName;
    tone?: "default" | "danger";
    disabled?: boolean;
    onSelect: () => void;
  };
}

interface PickerPosition {
  placement: "above" | "below";
  style: CSSProperties;
}

interface GroupSection {
  id: string;
  name: string;
  profiles: ConnectionProfile[];
}

interface SubmenuPosition {
  placement: "left" | "right";
  style: CSSProperties;
}

const VIEWPORT_INSET = 8;
const POPOVER_GAP = 4;
const POPOVER_WIDTH = 292;
const POPOVER_PREFERRED_HEIGHT = 580;
const POPOVER_MAX_HEIGHT = 600;
const SUBMENU_WIDTH = 260;
const SUBMENU_MAX_HEIGHT = 360;
const GROUP_OPEN_DELAY = 100;
const GROUP_CLOSE_DELAY = 180;
const SUBMENU_SCROLLBAR_HIDE_DELAY = 1_200;

export function TerminalTargetPicker({ profiles, groups = [], recentProfileIds = [], selectedProfileId, status, detail, onSelect, onManageConnections, icon = "terminal", localName = "本地终端", localDetail = "系统默认 Shell", ariaContext = "终端连接", allowLocal = true, hideDetail = false, localAttention = false, onRequestDisconnect, statusAction }: TerminalTargetPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<SubmenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuScrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const scrollbarHideTimerRef = useRef<number | null>(null);
  const suppressGroupFocusRef = useRef(false);
  const selected = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const name = selected?.name ?? localName;

  const recentProfiles = useMemo(() => recentProfileIds
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is ConnectionProfile => Boolean(profile))
    .slice(0, 6), [profiles, recentProfileIds]);

  const groupSections = useMemo<GroupSection[]>(() => {
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const grouped = groups.map((group) => ({
      id: group.id,
      name: group.name,
      profiles: profiles.filter((profile) => profile.groupId === group.id),
    }));
    const ungrouped = profiles.filter((profile) => !profile.groupId || !knownGroupIds.has(profile.groupId));
    return [
      ...grouped.filter((section) => section.profiles.length > 0),
      ...(ungrouped.length > 0 ? [{ id: "__ungrouped__", name: "未分组", profiles: ungrouped }] : []),
    ];
  }, [groups, profiles]);

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    return profiles.filter((profile) => `${profile.name}\n${profile.host}\n${profile.username}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [profiles, query]);

  const activeGroup = groupSections.find((section) => section.id === activeGroupId) ?? null;

  const clearGroupTimers = useCallback(() => {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  }, []);

  const positionSubmenu = useCallback((groupId: string) => {
    const button = groupButtonRefs.current.get(groupId);
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(SUBMENU_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_INSET * 2));
    const placement = rect.right + POPOVER_GAP + width <= window.innerWidth - VIEWPORT_INSET ? "right" : "left";
    const left = placement === "right"
      ? rect.right + POPOVER_GAP
      : Math.max(VIEWPORT_INSET, rect.left - POPOVER_GAP - width);
    const maxHeight = Math.min(SUBMENU_MAX_HEIGHT, Math.max(96, window.innerHeight - VIEWPORT_INSET * 2));
    const profileCount = groupSections.find((section) => section.id === groupId)?.profiles.length ?? 0;
    const estimatedHeight = Math.min(maxHeight, profileCount * 39 + Math.max(0, profileCount - 1) * 2 + 10);
    const top = Math.min(Math.max(VIEWPORT_INSET, rect.top), Math.max(VIEWPORT_INSET, window.innerHeight - estimatedHeight - VIEWPORT_INSET));
    setSubmenuPosition({ placement, style: { top, left, width, height: estimatedHeight, maxHeight } });
  }, [groupSections]);

  const updateSubmenuScrollbar = useCallback(() => {
    const root = submenuRef.current;
    const element = submenuScrollRef.current;
    if (!root || !element) return;
    const trackHeight = Math.max(0, element.clientHeight);
    const scrollRange = Math.max(0, element.scrollHeight - element.clientHeight);
    const scrollable = scrollRange > 1 && trackHeight > 0;
    root.dataset.scrollable = String(scrollable);
    if (scrollbarHideTimerRef.current !== null) window.clearTimeout(scrollbarHideTimerRef.current);
    if (!scrollable) {
      root.dataset.scrollbarVisible = "false";
      scrollbarHideTimerRef.current = null;
      return;
    }
    const thumbHeight = Math.max(24, Math.round(trackHeight * element.clientHeight / element.scrollHeight));
    const thumbRange = Math.max(0, trackHeight - thumbHeight);
    const thumbOffset = Math.round(thumbRange * element.scrollTop / scrollRange);
    root.style.setProperty("--terminal-target-scroll-thumb-height", `${thumbHeight}px`);
    root.style.setProperty("--terminal-target-scroll-thumb-offset", `${thumbOffset}px`);
    root.dataset.scrollbarVisible = "true";
    scrollbarHideTimerRef.current = window.setTimeout(() => {
      if (submenuRef.current === root) root.dataset.scrollbarVisible = "false";
      scrollbarHideTimerRef.current = null;
    }, SUBMENU_SCROLLBAR_HIDE_DELAY);
  }, []);

  const closePicker = useCallback(() => {
    clearGroupTimers();
    if (scrollbarHideTimerRef.current !== null) window.clearTimeout(scrollbarHideTimerRef.current);
    scrollbarHideTimerRef.current = null;
    setOpen(false);
    setQuery("");
    setActiveGroupId(null);
    setSubmenuPosition(null);
  }, [clearGroupTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_INSET * 2));
      const belowSpace = window.innerHeight - rect.bottom - POPOVER_GAP - VIEWPORT_INSET;
      const aboveSpace = rect.top - POPOVER_GAP - VIEWPORT_INSET;
      const placement = belowSpace >= POPOVER_PREFERRED_HEIGHT || belowSpace >= aboveSpace ? "below" : "above";
      const availableHeight = Math.max(96, placement === "below" ? belowSpace : aboveSpace);
      const maxHeight = Math.min(POPOVER_MAX_HEIGHT, availableHeight);
      const left = Math.min(Math.max(VIEWPORT_INSET, rect.left), Math.max(VIEWPORT_INSET, window.innerWidth - width - VIEWPORT_INSET));
      setPosition({
        placement,
        style: placement === "below"
          ? { top: rect.bottom + POPOVER_GAP, left, width, maxHeight }
          : { bottom: window.innerHeight - rect.top + POPOVER_GAP, left, width, maxHeight },
      });
    };
    updatePosition();
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (popoverRef.current?.contains(target) || submenuRef.current?.contains(target))) return;
      updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !activeGroupId) return;
    const updateSubmenuPosition = () => positionSubmenu(activeGroupId);
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && submenuRef.current?.contains(target)) return;
      updateSubmenuPosition();
    };
    updateSubmenuPosition();
    window.addEventListener("resize", updateSubmenuPosition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", updateSubmenuPosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeGroupId, open, positionSubmenu]);

  useLayoutEffect(() => {
    if (!activeGroupId || !submenuPosition) return;
    const frame = window.requestAnimationFrame(updateSubmenuScrollbar);
    window.addEventListener("resize", updateSubmenuScrollbar);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSubmenuScrollbar);
    };
  }, [activeGroupId, submenuPosition, updateSubmenuScrollbar]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target) && !submenuRef.current?.contains(target)) closePicker();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (activeGroupId) {
        const groupId = activeGroupId;
        setActiveGroupId(null);
        setSubmenuPosition(null);
        suppressGroupFocusRef.current = true;
        groupButtonRefs.current.get(groupId)?.focus();
        return;
      }
      closePicker();
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [activeGroupId, closePicker, open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => () => {
    clearGroupTimers();
    if (scrollbarHideTimerRef.current !== null) window.clearTimeout(scrollbarHideTimerRef.current);
  }, [clearGroupTimers]);

  function select(profileId: string | null) {
    closePicker();
    onSelect(profileId);
  }

  function manageConnections() {
    closePicker();
    onManageConnections?.();
  }

  function openGroup(groupId: string, focusFirst = false) {
    clearGroupTimers();
    setActiveGroupId(groupId);
    positionSubmenu(groupId);
    if (focusFirst) window.requestAnimationFrame(() => submenuRef.current?.querySelector<HTMLButtonElement>("[data-submenu-option]")?.focus());
  }

  function scheduleOpenGroup(groupId: string) {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(() => openGroup(groupId), GROUP_OPEN_DELAY);
  }

  function scheduleCloseGroup() {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setActiveGroupId(null);
      setSubmenuPosition(null);
    }, GROUP_CLOSE_DELAY);
  }

  function navigateEntries(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const entries = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>("[data-target-entry]") ?? []);
    if (entries.length === 0) return;
    event.preventDefault();
    const current = entries.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    entries[(current + delta + entries.length) % entries.length]?.focus();
  }

  function navigateSubmenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const groupId = activeGroupId;
      setActiveGroupId(null);
      setSubmenuPosition(null);
      if (groupId) {
        suppressGroupFocusRef.current = true;
        groupButtonRefs.current.get(groupId)?.focus();
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const entries = Array.from(submenuRef.current?.querySelectorAll<HTMLButtonElement>("[data-submenu-option]") ?? []);
    if (entries.length === 0) return;
    event.preventDefault();
    const current = entries.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    entries[(current + delta + entries.length) % entries.length]?.focus();
  }

  const popover = open && position ? <div
    ref={popoverRef}
    className="terminal-target-menu"
    role="dialog"
    aria-label={`选择${ariaContext}`}
    data-placement={position.placement}
    style={position.style}
    onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={navigateEntries}
  >
    <div className="terminal-target-search">
      <Icon name="computer" size={12}/>
      <ExactTextInput ref={searchRef} type="search" aria-label={`搜索${ariaContext}`} placeholder="搜索名称、主机或用户" value={query} onChange={(event) => {
        clearGroupTimers();
        setActiveGroupId(null);
        setSubmenuPosition(null);
        setQuery(event.target.value);
      }}/>
    </div>
    {allowLocal && <div className="terminal-target-local">
      <TargetOption icon={icon} name={localName} detail={localDetail} selected={selectedProfileId === null} onClick={() => select(null)} mainEntry/>
    </div>}
    <div className="terminal-target-list" aria-label={`${ariaContext}列表`}>
      {query ? <>
        {searchResults.map((profile) => <TargetOption key={profile.id} icon="computer" name={profile.name} detail={`${profile.username}@${profile.host}:${profile.port}`} selected={profile.id === selectedProfileId} onClick={() => select(profile.id)} mainEntry/>)}
        {searchResults.length === 0 && <div className="terminal-target-empty">没有匹配的连接</div>}
      </> : <>
        <div className="terminal-target-section-label">最近使用</div>
        {recentProfiles.map((profile) => <TargetOption key={profile.id} icon="computer" name={profile.name} detail={`${profile.username}@${profile.host}:${profile.port}`} selected={profile.id === selectedProfileId} onClick={() => select(profile.id)} mainEntry/>)}
        {recentProfiles.length === 0 && <div className="terminal-target-recent-empty">暂无最近连接</div>}
        <div className="terminal-target-section-label terminal-target-groups-label">连接分组</div>
        {groupSections.map((section) => <button
          key={section.id}
          ref={(element) => { if (element) groupButtonRefs.current.set(section.id, element); else groupButtonRefs.current.delete(section.id); }}
          className="terminal-target-group-entry"
          type="button"
          data-target-entry
          aria-haspopup="dialog"
          aria-expanded={activeGroupId === section.id}
          onPointerEnter={() => scheduleOpenGroup(section.id)}
          onPointerLeave={scheduleCloseGroup}
          onFocus={() => {
            if (suppressGroupFocusRef.current) {
              suppressGroupFocusRef.current = false;
              return;
            }
            openGroup(section.id);
          }}
          onClick={() => openGroup(section.id)}
          onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); openGroup(section.id, true); } }}
        >
          <Icon name="computer" size={12}/><strong>{section.name}</strong><span className="terminal-target-group-meta"><small>{section.profiles.length}</small><span className="terminal-target-group-arrow" aria-hidden="true"/></span>
        </button>)}
        {groupSections.length === 0 && <div className="terminal-target-recent-empty">连接管理中暂无配置</div>}
      </>}
    </div>
    {onManageConnections && <button className="terminal-target-manage" type="button" onClick={manageConnections}><Icon name="settings" size={12}/><span>管理连接…</span></button>}
  </div> : null;

  const submenu = popover && activeGroup && submenuPosition ? <div
    ref={submenuRef}
    className="terminal-target-submenu"
    role="dialog"
    aria-label={`${activeGroup.name}连接`}
    data-placement={submenuPosition.placement}
    style={submenuPosition.style}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerEnter={() => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }}
    onPointerLeave={scheduleCloseGroup}
    onKeyDown={navigateSubmenu}
  >
    <div ref={submenuScrollRef} className="terminal-target-submenu-list" onScroll={updateSubmenuScrollbar}>
      {activeGroup.profiles.map((profile) => <TargetOption key={profile.id} icon="computer" name={profile.name} detail={`${profile.username}@${profile.host}:${profile.port}`} selected={profile.id === selectedProfileId} onClick={() => select(profile.id)} submenuEntry/>)}
    </div>
    <div className="terminal-target-scrollbar" aria-hidden="true"><span/></div>
  </div> : null;

  return <div className="terminal-target" data-remote={selectedProfileId !== null || undefined} data-status={status} ref={rootRef}>
    <span className={`connection-dot ${status}`} />
    <button
      ref={triggerRef}
      className="terminal-target-trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`选择${ariaContext}，当前：${name}`}
      onClick={() => {
        if (open) closePicker();
        else {
          setQuery("");
          setOpen(true);
        }
      }}
    >
      <Icon name={icon} size={13}/>
      <span className={`terminal-target-name${localAttention && selectedProfileId === null ? " local-terminal-attention" : ""}`}>{name}</span>
    </button>
    {!hideDetail && (selected && status === "connected"
      ? <HostIdentity profile={selected} label={detail} className="terminal-target-endpoint" dangerAction={onRequestDisconnect ? { label: "断开连接", onSelect: onRequestDisconnect } : undefined}/>
      : <small>{detail}</small>)}
    {!hideDetail && statusAction && <ThemedTooltipButton
      type="button"
      className="terminal-target-status-action"
      data-tone={statusAction.tone}
      aria-label={statusAction.label}
      tooltip={statusAction.label}
      disabled={statusAction.disabled}
      onClick={statusAction.onSelect}
    ><Icon name={statusAction.icon} size={11}/></ThemedTooltipButton>}
    {popover && createPortal(<>{popover}{submenu}</>, document.body)}
  </div>;
}

function TargetOption({ icon, name, detail, selected, onClick, mainEntry = false, submenuEntry = false }: { icon: IconName; name: string; detail: string; selected: boolean; onClick: () => void; mainEntry?: boolean; submenuEntry?: boolean }) {
  return <button className="terminal-target-option" type="button" data-target-entry={mainEntry || undefined} data-submenu-option={submenuEntry || undefined} aria-pressed={selected} onClick={onClick}>
    <Icon name={icon} size={13}/><span><strong>{name}</strong><small>{detail}</small></span>
  </button>;
}
