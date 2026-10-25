import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { WebBrowserPane } from "./WebBrowserPane";
import { WebTabStrip } from "./WebTabStrip";
import { WEB_TAB_LIMIT } from "./webTabDeck";
import { closeWebTabBatch } from "./webTabClose";
import "./webTabs.css";
import type { WebPopupRequest } from "../lib/tauri/webPopups";
import type { WebTabSessionStore } from "./webTabSessionStore";

export interface WebTabMetadata { title: string; address: string; loading: boolean }
interface Tab extends WebTabMetadata { id: string; initialAddress?: string; initialPopup?: WebPopupRequest; restored?: boolean }
const emptyTab = (): Tab => ({ id: crypto.randomUUID(), title: "", address: "", loading: false });
type Props = ComponentProps<typeof WebBrowserPane> & { header: HTMLElement | null; sessionStore?: WebTabSessionStore; blockId?: string; registerOpener?: (open: (url: string) => void) => () => void; onHeaderPointerDown?: (event: PointerEvent<HTMLElement>) => void };

/** Tabs own page lifetime; the connection environment owns shared browser data. */
export function WebTabs({ header, registerOpener, onHeaderPointerDown, sessionStore, blockId, ...pane }: Props) {
  const [binding] = useState(() => blockId ? sessionStore?.bind(blockId, pane.profileId) : undefined);
  const [tabs, setTabs] = useState<Tab[]>(() => binding?.initial?.tabs.map(tab => ({ ...tab, loading: false, initialAddress: tab.address, restored: true })) ?? [emptyTab()]);
  const [active, setActive] = useState<string | null>(() => binding?.initial?.selectedTabId ?? null);
  const selected = active ?? tabs[0].id;
  useLayoutEffect(() => { binding?.activate(); }, [binding]);
  useLayoutEffect(() => { binding?.update({ tabs, selectedTabId: selected }); }, [binding, tabs, selected]);
  const latestTabs = useRef(tabs);
  useLayoutEffect(() => { latestTabs.current = tabs; }, [tabs]);
  useLayoutEffect(() => registerOpener?.(url => {
    const previous = latestTabs.current;
    const empty = previous.find(tab => !tab.address && !tab.initialAddress && !tab.initialPopup && !tab.loading);
    if (!empty && previous.length >= WEB_TAB_LIMIT) throw new Error("此浏览器已达 10 个标签页，请先关闭部分标签页");
    const page = { ...(empty ?? emptyTab()), address: url, initialAddress: url };
    const next = empty ? previous.map(tab => tab.id === empty.id ? page : tab) : [...previous, page];
    latestTabs.current = next;
    setTabs(next);
    setActive(page.id);
  }), [registerOpener]);
  const update = useCallback((id: string, metadata: WebTabMetadata) => setTabs(previous => previous.map(tab =>
    tab.id !== id || (tab.title === metadata.title && tab.address === metadata.address && tab.loading === metadata.loading) ? tab : { ...tab, ...metadata })), []);
  const add = () => { if (latestTabs.current.length >= WEB_TAB_LIMIT) return; const tab = emptyTab(); const next = [...latestTabs.current, tab]; latestTabs.current = next; setTabs(next); setActive(tab.id); };
  const openPopup = useCallback((request: WebPopupRequest) => {
    const previous = latestTabs.current;
    if (previous.some(tab => tab.initialPopup?.requestId === request.requestId)) return;
    if (previous.length >= WEB_TAB_LIMIT) throw new Error("此浏览器已达 10 个标签页，请先关闭部分标签页");
    const page = { ...emptyTab(), initialPopup: request, address: request.url === "about:blank" ? "" : request.url, loading: true };
    const next = [...previous, page];
    latestTabs.current = next;
    setTabs(next); setActive(page.id);
  }, []);
  const close = (ids: string[], anchor: string) => {
    const next = closeWebTabBatch(latestTabs.current, selected, ids, anchor, emptyTab);
    latestTabs.current = next.tabs;
    setTabs(next.tabs); setActive(next.selected);
    requestAnimationFrame(() => header?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  };
  return <>
    {header && createPortal(<WebTabStrip tabs={tabs} selected={selected} visible={pane.visible} onSelect={setActive} onClose={close} onAdd={add} onActivate={pane.onActivate} onBlankPointerDown={onHeaderPointerDown}/>, header)}
    {tabs.map(tab => <div className="web-tab-page" key={tab.id} id={`page-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={selected !== tab.id}>
      <TabPage {...pane} restored={tab.restored} initialAddress={tab.initialAddress} initialPopup={tab.initialPopup} onNewWindow={openPopup} onWindowClose={() => close([tab.id], tab.id)} id={tab.id} visible={pane.visible && selected === tab.id} update={update}/>
    </div>)}
  </>;
}

function TabPage({ id, update, restored, ...props }: ComponentProps<typeof WebBrowserPane> & { id: string; restored?: boolean; update: (id: string, state: WebTabMetadata) => void }) {
  const [started, setStarted] = useState(!restored || props.visible);
  if (!started && props.visible) setStarted(true);
  const report = useCallback((state: WebTabMetadata) => {
    if (props.initialAddress && !state.address) return; // Initial empty metadata must not erase restored URLs.
    update(id, state);
  }, [id, update, props.initialAddress]);
  return started ? <WebBrowserPane {...props} onMetadata={report}/> : null;
}
