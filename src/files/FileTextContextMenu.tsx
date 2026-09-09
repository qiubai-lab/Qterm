import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { fitContextMenu } from "./fileBrowserModel";

export interface FileTextContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function FileTextContextMenu({ anchor, label, groups, className, focusOnOpen = true, onDismiss }: {
  anchor: { x: number; y: number };
  label: string;
  groups: FileTextContextMenuItem[][];
  className?: string;
  focusOnOpen?: boolean;
  onDismiss: (restoreFocus: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchor.x, y: anchor.y, placement: "below" as "above" | "below" });

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    setPosition(fitContextMenu(anchor.x, anchor.y, menuRef.current.offsetWidth, menuRef.current.offsetHeight, window.innerWidth, window.innerHeight));
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) onDismiss(false);
    };
    const closeOnKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onDismiss(true);
    };
    const closeWithoutFocus = () => onDismiss(false);
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    const focusTimer = focusOnOpen
      ? window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0)
      : undefined;
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
  }, [focusOnOpen, onDismiss]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(index + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      onDismiss(true);
    }
  }

  const visibleGroups = groups.filter((group) => group.length > 0);
  return createPortal(<div
    ref={menuRef}
    className={`file-context-menu file-text-context-menu${className ? ` ${className}` : ""}`}
    data-placement={position.placement}
    role="menu"
    aria-label={label}
    style={{ left: position.x, top: position.y }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={handleKeyDown}
  >
    {visibleGroups.map((group, groupIndex) => <div className="file-text-context-menu-group" role="group" key={groupIndex}>
      {group.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { onDismiss(false); item.onSelect(); }}><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}
      {groupIndex < visibleGroups.length - 1 && <div className="file-context-menu-separator" role="separator"/>}
    </div>)}
  </div>, document.body);
}
