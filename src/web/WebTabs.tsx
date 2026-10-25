import { useCallback, useLayoutEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { WebBrowserPane } from "./WebBrowserPane";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { WebTabButton } from "./WebTabButton";
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
  useLayoutEffect(() => {
    const list = header?.querySelector<HTMLElement>(".web-tab-list");
    const tab = list?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!list || !tab) return;
    const viewport = list.getBoundingClientRect(), item = tab.getBoundingClientRect();
    // Scroll only the tab strip; scrolling ancestors would move the native surface.
    if (item.left < viewport.left) list.scrollLeft += item.left - viewport.left;
    else if (item.right > viewport.right) list.scrollLeft += item.right - viewport.right;
  }, [header, selected, tabs.length]);
  const update = useCallback((id: string, metadata: WebTabMetadata) => setTabs(previous => previous.map(tab =>
    tab.id !== id || (tab.title === metadata.title && tab.address === metadata.address && tab.loading === metadata.loading) ? tab : { ...tab, ...metadata })), []);
  const add = () => { if (tabs.length >= 16) return; const tab = emptyTab(); setTabs(previous => [...previous, tab]); setActive(tab.id); };
  const close = (id: string) => {
    const index = tabs.findIndex(tab => tab.id === id);
    const remaining = tabs.filter(tab => tab.id !== id);
    if (!remaining.length) remaining.push(emptyTab());
    setTabs(remaining);
    if (selected === id) setActive(remaining[Math.min(index, remaining.length - 1)].id);
  };
  return <>
    {header && createPortal(<div className="web-tabs" onPointerDown={event => { event.stopPropagation(); pane.onActivate(); }}>
      <div className="web-tab-list" role="tablist" aria-label="网页标签">
        {tabs.map(tab => <div className="web-tab" key={tab.id} data-selected={tab.id === selected}>
          <WebTabButton caption={tab.title || tab.address || "新标签页"} loading={tab.loading} role="tab" id={`tab-${tab.id}`} aria-controls={`page-${tab.id}`} aria-selected={tab.id === selected} tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => setActive(tab.id)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = tabs.indexOf(tab);
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
              setActive(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus({ preventScroll: true });
            }}/>
          <ThemedTooltipButton type="button" tooltip="关闭标签页" aria-label={`关闭标签页 ${tab.title || tab.address || "新标签页"}`} onClick={() => close(tab.id)}><Icon name="close" size={11}/></ThemedTooltipButton>
        </div>)}
      </div>
      <ThemedTooltipButton type="button" tooltip={tabs.length >= 16 ? "每个 block 最多 16 个标签" : "新建标签页"} aria-label="新建标签页" disabled={tabs.length >= 16} onClick={add}><Icon name="plus" size={13}/></ThemedTooltipButton>
    </div>, header)}
    {tabs.map(tab => <div className="web-tab-page" key={tab.id} id={`page-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={selected !== tab.id}>
      <TabPage {...pane} id={tab.id} visible={pane.visible && selected === tab.id} update={update}/>
    </div>)}
  </>;
}

function TabPage({ id, update, ...props }: ComponentProps<typeof WebBrowserPane> & { id: string; update: (id: string, state: WebTabMetadata) => void }) {
  const report = useCallback((state: WebTabMetadata) => update(id, state), [id, update]);
  return <WebBrowserPane {...props} onMetadata={report}/>;
}
