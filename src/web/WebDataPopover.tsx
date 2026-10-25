import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { Button } from "../components/Button";
import type { WebDataSelection } from "../lib/tauri/web";
import "./webDataPopover.css";

export function WebDataPopover({ disabled, profileName, onClear, dismissKey }: { dismissKey?: number; disabled: boolean; profileName: string; onClear: (selection: WebDataSelection) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState<WebDataSelection>({ cache: true, cookies: false, storage: false });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [seenDismissKey, setSeenDismissKey] = useState(dismissKey);
  if (seenDismissKey !== dismissKey) { setSeenDismissKey(dismissKey); if (!busy) setOpen(false); }
  useLayoutEffect(() => {
    const block = root.current?.closest(".web-block");
    if (!open || !block || !panel.current) return;
    const measure = () => {
      const owner = block.getBoundingClientRect(), anchor = root.current!.getBoundingClientRect();
      const width = Math.min(300, Math.max(0, owner.width - 16));
      const left = Math.max(owner.left + 8, Math.min(anchor.left, owner.right - 8 - width));
      panel.current!.style.width = `${width}px`;
      panel.current!.style.left = `${left - anchor.left}px`;
      panel.current!.style.maxHeight = `${Math.max(0, owner.bottom - anchor.bottom - 16)}px`;
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(block);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => { if (!busy && event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); } };
    window.addEventListener("pointerdown", pointer); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", pointer); window.removeEventListener("keydown", key, true); };
  }, [open, busy]);
  return <div className="web-data-control" ref={root}>
    <ThemedTooltipButton anchorRef={trigger} tooltipPlacement="above" tooltipDisabled={open} type="button" tooltip="清理浏览数据" aria-label="清理浏览数据" aria-haspopup="dialog" aria-expanded={open} disabled={disabled || busy} onClick={() => { setMessage(""); setOpen(value => !value); }}><Icon name="lock" size={12}/></ThemedTooltipButton>
    {open && <div ref={panel} className="web-data-popover" role="dialog" aria-modal="false" aria-label="清理浏览数据" data-web-native-overlay="data-cleanup" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
      <div className="web-data-heading">
        <span className="web-data-icon" aria-hidden="true"><Icon name="lock" size={13}/></span>
        <span><strong>清理浏览数据</strong><small>当前连接：{profileName}</small></span>
      </div>
      <div className="web-data-options" role="group" aria-label="选择清理内容">
      {([
        ["cache", "网页资源缓存", "图片、脚本等，不清除登录信息"],
        ["cookies", "Cookie 与登录状态", "可能需要重新登录"],
        ["storage", "站点存储", "包含本地数据、离线内容及可能的登录令牌"],
      ] as const).map(([key, label, hint]) => <label key={key} data-selected={selection[key]}><input type="checkbox" checked={selection[key]} disabled={busy} onChange={event => setSelection(previous => ({ ...previous, [key]: event.target.checked }))}/><span>{label}<small>{hint}</small></span></label>)}
      </div>
      <p className="web-data-scope">影响此连接的所有 block 和标签页，清理时会重新载入页面。历史记录与收藏保留。</p>
      <div className="web-data-footer">
      <div className="web-data-status" role="status">{busy ? "正在清理…" : message || `已选 ${Object.values(selection).filter(Boolean).length} 项`}</div>
      <div className="web-data-actions"><Button size="compact" variant="danger" disabled={busy} onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>取消</Button><Button size="compact" variant="primary" disabled={busy || !Object.values(selection).some(Boolean)} onClick={() => {
        setBusy(true); setMessage("");
        void onClear(selection).then(() => setMessage("已清理，页面正在重新载入"), error => setMessage(String(error))).finally(() => setBusy(false));
      }}><Icon name="clear" size={11}/>清理</Button></div>
      </div>
    </div>}
  </div>;
}
