import { useEffect, useId, useRef, type ReactNode } from "react";

import { IconButton } from "../Button";
import { Icon } from "../Icon";

const dialogStack: symbol[] = [];

export function DialogFrame({ title, subtitle, onClose, children, headerActions, wide = false, compact = false, dismissible = true, blocking = !dismissible, modal = true, className, scrimClassName }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; headerActions?: ReactNode; wide?: boolean; compact?: boolean; dismissible?: boolean; blocking?: boolean; modal?: boolean; className?: string; scrimClassName?: string }) {
  const frameRef = useRef<HTMLElement>(null);
  const stackIdRef = useRef(Symbol("dialog"));
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { dismissibleRef.current = dismissible; }, [dismissible]);
  useEffect(() => {
    const stackId = stackIdRef.current;
    dialogStack.push(stackId);
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(frameRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? []);
    (frameRef.current?.querySelector<HTMLElement>("[data-dialog-autofocus]") ?? focusable()[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== stackId) return;
      if (event.key === "Escape" && dismissibleRef.current) onCloseRef.current();
      if (!modal || event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) { event.preventDefault(); frameRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      const index = dialogStack.lastIndexOf(stackId);
      if (index >= 0) dialogStack.splice(index, 1);
      previous?.focus();
    };
  }, [modal]);
  return <div className={`dialog-scrim${blocking ? " dialog-scrim-blocking" : ""}${scrimClassName ? ` ${scrimClassName}` : ""}`} onPointerDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
    <section ref={frameRef} tabIndex={-1} className={`dialog-frame${wide ? " dialog-wide" : ""}${compact ? " dialog-compact" : ""}${className ? ` ${className}` : ""}`} role="dialog" aria-modal={modal || undefined} aria-labelledby={titleId}>
      <header className="dialog-header"><div className="dialog-header-copy"><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="dialog-header-actions">{headerActions}{dismissible && <IconButton label="关闭" onClick={onClose}><Icon name="close"/></IconButton>}</div></header>
      <div className="dialog-content">{children}</div>
    </section>
  </div>;
}

export function DialogActionStatus({ message }: { message: string }) {
  return <p className={`dialog-action-status${message ? " error" : ""}`} role={message ? "alert" : undefined} aria-live="polite" title={message || undefined}>{message}</p>;
}
