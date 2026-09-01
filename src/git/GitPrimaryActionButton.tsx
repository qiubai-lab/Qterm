import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "../components/Icon";
import type { GitPrimaryAction, GitPrimaryAlternativeAction, GitPrimaryActionKind } from "./gitPrimaryAction";

interface MenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

function actionIcon(kind: GitPrimaryActionKind): IconName {
  if (kind === "stageAll") return "plus";
  if (kind === "commit") return "check";
  if (kind === "push" || kind === "publish" || kind === "chooseRemote") return "upload";
  if (kind === "pull") return "download";
  if (kind === "idle") return "checkCircle";
  return "git";
}

function fitMenu(anchor: DOMRect, width: number, height: number): MenuPosition {
  const gutter = 8;
  const offset = 4;
  const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
  const below = anchor.bottom + offset;
  if (below + height <= window.innerHeight - gutter) return { left, top: below, placement: "below" };
  return { left, top: Math.max(gutter, anchor.top - height - offset), placement: "above" };
}

export function GitPrimaryActionButton({ action, onAction }: {
  action: GitPrimaryAction;
  onAction: (action: GitPrimaryAction | GitPrimaryAlternativeAction) => void;
}) {
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuId = useId();
  const splitRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const alternative = action.alternative;

  function closeMenu(restoreFocus: boolean) {
    setMenuPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  function openMenu() {
    if (!alternative || !toggleRef.current) return;
    setMenuPosition(fitMenu(toggleRef.current.getBoundingClientRect(), 216, 34));
  }

  useLayoutEffect(() => {
    if (!menuPosition || !menuRef.current || !toggleRef.current) return;
    const next = fitMenu(toggleRef.current.getBoundingClientRect(), menuRef.current.offsetWidth, menuRef.current.offsetHeight);
    setMenuPosition((current) => current && current.left === next.left && current.top === next.top && current.placement === next.placement ? current : next);
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuPosition]);

  useEffect(() => {
    if (!menuPosition) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !splitRef.current?.contains(target)) closeMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const closeOnViewportChange = () => closeMenu(false);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [menuPosition]);

  return <>
    <div ref={splitRef} className="git-primary-action-split" data-has-alternative={Boolean(alternative) || undefined}>
      <button type="button" className="git-primary-action" disabled={action.disabled} title={action.title} onClick={() => onAction(action)}>
        <Icon name={actionIcon(action.kind)} size={12}/><span>{action.label}</span>
      </button>
      {alternative && <button
        ref={toggleRef}
        type="button"
        className="git-primary-action-toggle"
        aria-label="更多提交操作"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPosition)}
        aria-controls={menuPosition ? menuId : undefined}
        onClick={() => menuPosition ? closeMenu(true) : openMenu()}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          openMenu();
        }}
      ><Icon name="chevronDown" size={11}/></button>}
    </div>
    {menuPosition && alternative && createPortal(<div
      ref={menuRef}
      id={menuId}
      className="git-primary-action-menu"
      data-placement={menuPosition.placement}
      role="menu"
      aria-label="其他提交操作"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      }}
    >
      <button type="button" role="menuitem" onClick={() => { closeMenu(false); onAction(alternative); }}><Icon name="plus" size={12}/><span>{alternative.label}</span></button>
    </div>, document.body)}
  </>;
}
