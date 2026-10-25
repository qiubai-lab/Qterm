import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import type { WebDrawerPhase } from "./useWebLibraryDrawer";
import "./webLibraryDrawer.css";

export function WebLibraryDrawerFrame({ profileName, phase, dismissible, onClose, children }: {
  profileName: string; phase: WebDrawerPhase; dismissible: boolean; onClose: () => void; children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const wasClosing = useRef(false);
  const title = useId();
  const closing = phase === "closing";
  useEffect(() => {
    const element = frame.current;
    previous.current = document.activeElement as HTMLElement | null;
    element?.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus({ preventScroll: true });
    return () => {
      if (document.hasFocus() && previous.current?.isConnected && (element?.contains(document.activeElement) || document.activeElement === document.body)) previous.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (closing && document.hasFocus() && (frame.current?.contains(document.activeElement) || document.activeElement === document.body)) previous.current?.focus({ preventScroll: true });
    else if (!closing && wasClosing.current) frame.current?.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus({ preventScroll: true });
    wasClosing.current = closing;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || closing || !dismissible || !frame.current?.contains(document.activeElement)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      onClose();
    };
    const outside = (event: PointerEvent) => {
      const element = frame.current;
      if (closing || !dismissible || !(event.target instanceof Node) || element?.contains(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (element?.closest(".web-browser-surface")?.contains(event.target)) onClose();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("pointerdown", outside); };
  }, [closing, dismissible, onClose]);
  return <section ref={frame} className="web-library-dialog web-library-drawer" role="dialog" data-app-overlay="floating" data-overlay-clip="parent" data-overlay-motion="slide" aria-modal="false" aria-labelledby={title}
    aria-hidden={closing || undefined} data-state={phase} tabIndex={-1}>
    <div className="web-library-drawer-interior" inert={closing || undefined}>
      <header className="web-library-drawer-header">
        <div><h2 id={title}>浏览记录</h2><p>{profileName} · 此连接的访问历史与收藏</p></div>
        <ThemedTooltipButton tooltip="关闭浏览记录" aria-label="关闭浏览记录" disabled={!dismissible} onClick={onClose}><Icon name="close" size={14}/></ThemedTooltipButton>
      </header>
      {children}
    </div>
  </section>;
}
