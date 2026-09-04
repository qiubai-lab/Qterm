import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../components/Icon";

interface TerminalHeaderAction {
  label: string;
  title?: string;
  icon: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

interface HeaderMenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

function fitHeaderMenu(anchor: DOMRect, width: number, height: number): HeaderMenuPosition {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

export function TerminalHeaderActions({ actions, closeDisabled, onClose }: { actions: TerminalHeaderAction[]; closeDisabled: boolean; onClose: () => void }) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<HeaderMenuPosition | null>(null);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuPosition(null);
    if (restoreFocus) window.setTimeout(() => moreButtonRef.current?.focus(), 0);
  }, []);

  function openMenu() {
    const anchor = moreButtonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setMenuPosition(fitHeaderMenu(anchor, 184, 170));
  }

  useLayoutEffect(() => {
    if (!menuPosition || !menuRef.current || !moreButtonRef.current) return;
    const next = fitHeaderMenu(
      moreButtonRef.current.getBoundingClientRect(),
      menuRef.current.offsetWidth,
      menuRef.current.offsetHeight,
    );
    if (next.left !== menuPosition.left || next.top !== menuPosition.top || next.placement !== menuPosition.placement) setMenuPosition(next);
  }, [menuPosition]);

  useEffect(() => {
    if (!menuPosition) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".terminal-header-menu")) closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const closeWithoutFocus = () => closeMenu(false);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
    };
  }, [closeMenu, menuPosition]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
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
      closeMenu(false);
    }
  }

  function runAction(action: TerminalHeaderAction) {
    closeMenu(false);
    action.onSelect();
  }

  return <>
    <div className="block-actions terminal-header-actions">
      <div className="terminal-header-secondary-actions">
        {actions.map((action) => <button key={action.label} type="button" aria-label={action.label} title={action.title ?? action.label} disabled={action.disabled} onClick={action.onSelect}><Icon name={action.icon} size={13}/></button>)}
      </div>
      <button
        ref={moreButtonRef}
        type="button"
        className="terminal-header-more"
        aria-label="更多终端操作"
        title="更多终端操作"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPosition)}
        onClick={() => menuPosition ? closeMenu() : openMenu()}
      ><Icon name="more" size={13}/></button>
      <button type="button" className="terminal-header-close" aria-label="关闭终端" title="关闭" disabled={closeDisabled} onClick={onClose}><Icon name="close" size={13}/></button>
    </div>
    {menuPosition && createPortal(<div
      ref={menuRef}
      className="terminal-header-menu"
      data-placement={menuPosition.placement}
      role="menu"
      aria-label="终端更多操作"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={() => runAction(action)}><Icon name={action.icon} size={13}/><span>{action.label}</span></button>)}
    </div>, document.body)}
  </>;
}

