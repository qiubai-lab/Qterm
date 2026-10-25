import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon";
import { OverlayScrollArea } from "../components/scrollbars/OverlayScrollArea";
import type { WebEntry } from "../lib/tauri/webLibrary";
import "./webAddressHistory.css";

interface Props {
  id: string;
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  entries: WebEntry[];
  selected: number;
  onSelect: (index: number) => void;
  onChoose: (index: number) => void;
  onDismiss: () => void;
}

/** Portal geometry follows its address field while workspace blocks move or resize. */
export function WebAddressHistory({ id, open, anchor, entries, selected, onSelect, onChoose, onDismiss }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) onDismiss();
    };
    // Native webpage interactions are mirrored as pointer input on their DOM surface.
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [anchor, open, onDismiss]);
  const [page, setPage] = useState({ open, count: 5 });
  if (page.open !== open) setPage({ open, count: open ? 5 : page.count });
  const required = selected >= 0 && selected < entries.length ? Math.ceil((selected + 1) / 5) * 5 : 5;
  const count = Math.min(entries.length, Math.max(page.count, required));
  if (open && count > page.count) setPage({ open, count });
  const loadMore = (element: HTMLDivElement) => {
    if (open && count < entries.length && element.scrollHeight - element.scrollTop - element.clientHeight <= 38) {
      setPage({ open, count: Math.min(entries.length, count + 5) });
    }
  };
  useLayoutEffect(() => { if (open && viewport.current) viewport.current.scrollTop = 0; }, [open]);
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  if (!open && present && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPresent(false);
  useEffect(() => {
    if (open || !present) return;
    // Retain the opaque native cutout through exit; reopening cancels disposal.
    const timer = window.setTimeout(() => setPresent(false), 130);
    return () => window.clearTimeout(timer);
  }, [open, present]);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, maxHeight: 0 });
  useLayoutEffect(() => { if (selected >= 0) document.getElementById(`${id}-${selected}`)?.scrollIntoView?.({ block: "nearest" }); }, [id, selected, count]);
  useLayoutEffect(() => {
    if (!present) return;
    let frame = 0;
    const measure = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) {
        const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
        const next = { left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 4, width, maxHeight: Math.max(0, window.innerHeight - rect.bottom - 12) };
        setBounds(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [anchor, present]);
  if (!present) return null;
  return createPortal(<div ref={panel} id={id} role="listbox" data-app-overlay="floating" data-overlay-motion="reveal" aria-hidden={!open} data-open={open} aria-label="最近访问记录" className="web-address-history" style={bounds} onPointerDown={event => event.preventDefault()}>
    <div className="web-address-history-heading">最近访问</div>
    <OverlayScrollArea ref={viewport} className="web-address-history-scroll" viewportClassName="web-address-history-list" density="compact"
      onScroll={event => { if (event.currentTarget.scrollTop > 0) loadMore(event.currentTarget); }} viewportProps={{ onWheel: event => {
        if (event.deltaY > 0 && !event.ctrlKey) loadMore(event.currentTarget);
      } }}>
      {entries.length === 0 && <p className="web-address-history-empty">暂无访问历史</p>}
      {entries.slice(0, count).map((entry, index) => <button type="button" role="option" id={`${id}-${index}`} aria-selected={selected === index} tabIndex={-1} key={entry.url} className="web-address-history-entry" onPointerMove={() => onSelect(index)} disabled={!open} onClick={() => onChoose(index)}>
        <Icon name="history" size={13}/><span><strong title={entry.title === entry.url ? new URL(entry.url).host : entry.title}>{entry.title === entry.url ? new URL(entry.url).host : entry.title}</strong><code title={entry.url}>{entry.url}</code></span>
      </button>)}
    </OverlayScrollArea>
    <button type="button" role="option" id={`${id}-${entries.length}`} aria-selected={selected === entries.length} tabIndex={-1} className="web-address-history-more" onPointerMove={() => onSelect(entries.length)} disabled={!open} onClick={() => onChoose(entries.length)}><Icon name="history" size={13}/>更多历史记录<Icon name="forward" size={12}/></button>
  </div>, document.body);
}
