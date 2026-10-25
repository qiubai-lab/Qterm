import { useCallback, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { WebBrowserPane } from "./WebBrowserPane";
import { WebTabStrip } from "./WebTabStrip";
import { WEB_TAB_LIMIT } from "./webTabDeck";
import { closeWebTabBatch } from "./webTabClose";
import "./webTabs.css";

export interface WebTabMetadata { title: string; address: string; loading: boolean }
interface Tab extends WebTabMetadata { id: string }
const emptyTab = (): Tab => ({ id: crypto.randomUUID(), title: "", address: "", loading: false });
type Props = ComponentProps<typeof WebBrowserPane> & { header: HTMLElement | null };

/** Tabs own page lifetime; the connection environment owns shared browser data. */
export function WebTabs({ header, ...pane }: Props) {
  const [tabs, setTabs] = useState<Tab[]>(() => [emptyTab()]);
  const [active, setActive] = useState<string | null>(null);
  const selected = active ?? tabs[0].id;
  const update = useCallback((id: string, metadata: WebTabMetadata) => setTabs(previous => previous.map(tab =>
    tab.id !== id || (tab.title === metadata.title && tab.address === metadata.address && tab.loading === metadata.loading) ? tab : { ...tab, ...metadata })), []);
  const add = () => { if (tabs.length >= WEB_TAB_LIMIT) return; const tab = emptyTab(); setTabs(previous => [...previous, tab]); setActive(tab.id); };
  const close = (ids: string[], anchor: string) => {
    const next = closeWebTabBatch(tabs, selected, ids, anchor, emptyTab);
    setTabs(next.tabs); setActive(next.selected);
    requestAnimationFrame(() => header?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  };
  return <>
    {header && createPortal(<WebTabStrip tabs={tabs} selected={selected} visible={pane.visible} onSelect={setActive} onClose={close} onAdd={add} onActivate={pane.onActivate}/>, header)}
    {tabs.map(tab => <div className="web-tab-page" key={tab.id} id={`page-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={selected !== tab.id}>
      <TabPage {...pane} id={tab.id} visible={pane.visible && selected === tab.id} update={update}/>
    </div>)}
  </>;
}

function TabPage({ id, update, ...props }: ComponentProps<typeof WebBrowserPane> & { id: string; update: (id: string, state: WebTabMetadata) => void }) {
  const report = useCallback((state: WebTabMetadata) => update(id, state), [id, update]);
  return <WebBrowserPane {...props} onMetadata={report}/>;
}
