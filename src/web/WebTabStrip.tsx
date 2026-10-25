import { useMemo, useRef } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { WebTabButton } from "./WebTabButton";
import type { WebTabMetadata } from "./WebTabs";
import { useWebTabDeck } from "./useWebTabDeck";
import { WEB_TAB_LIMIT, WEB_TAB_OVERLAP } from "./webTabDeck";
import "./webTabDeck.css";
import { TabActionMenu } from "../components/TabActionMenu";
import { useWebTabMenu } from "./useWebTabMenu";
import { webTabCloseLabels, webTabCloseTargets, type WebTabCloseAction } from "./webTabClose";

interface Props {
  tabs: (WebTabMetadata & { id: string })[]; selected: string; visible: boolean;
  onSelect: (id: string) => void; onClose: (ids: string[], anchor: string) => void; onAdd: () => void; onActivate: () => void;
}

export function WebTabStrip({ tabs, selected, visible, onSelect, onClose, onAdd, onActivate }: Props) {
  const ids = useMemo(() => tabs.map(tab => tab.id), [tabs]);
  const bar = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const context = useWebTabMenu(ids, visible);
  const deck = useWebTabDeck(ids, selected, bar, strip, tabRefs, context.menu?.anchorId ?? null);
  const scroll = (direction: number) => strip.current?.scrollBy({ left: direction * Math.max(112, strip.current.clientWidth * .7), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  return <div ref={bar} className="web-tabs" data-stacked={deck.layout.stacked || undefined} {...deck.events} {...context.events} onPointerDown={event => { event.stopPropagation(); onActivate(); }}>
    {deck.overflowing && <ThemedTooltipButton tooltip="显示左侧标签" aria-label="显示左侧标签" onClick={() => scroll(-1)}><Icon name="back" size={11}/></ThemedTooltipButton>}
    <div ref={strip} className="web-tab-list" role="tablist" aria-label="网页标签" onWheel={event => { if (deck.overflowing && !event.deltaX) event.currentTarget.scrollLeft += event.deltaY; }}>
      {deck.layout.stacked && <div className="web-deck-extent" aria-hidden="true" style={{ width: deck.layout.width + WEB_TAB_OVERLAP }}/>}
      {tabs.map((tab, index) => {
        const expanded = deck.layout.cards[index].expanded;
        return <div className="web-tab" key={tab.id} data-tab-id={tab.id} data-selected={tab.id === selected} data-expanded={expanded || undefined} ref={node => { if (node) tabRefs.current.set(tab.id, node); else tabRefs.current.delete(tab.id); }}>
          <WebTabButton caption={tab.title || tab.address || "新标签页"} loading={tab.loading} tooltipDisabled={Boolean(context.menu)} role="tab" id={`tab-${tab.id}`} aria-controls={`page-${tab.id}`} aria-selected={tab.id === selected} tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
              onSelect(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus({ preventScroll: true });
            }}/>
          <button type="button" className="web-tab-close" aria-label={`关闭标签页 ${tab.title || tab.address || "新标签页"}`} tabIndex={expanded ? 0 : -1} aria-hidden={!expanded || undefined} onClick={() => onClose([tab.id], tab.id)}><Icon name="close" size={11}/></button>
        </div>;
      })}
    </div>
    {deck.overflowing && <ThemedTooltipButton tooltip="显示右侧标签" aria-label="显示右侧标签" onClick={() => scroll(1)}><Icon name="forward" size={11}/></ThemedTooltipButton>}
    <ThemedTooltipButton tooltip={tabs.length >= WEB_TAB_LIMIT ? "每个 block 最多 10 个标签" : "新建标签页"} aria-label="新建标签页" disabled={tabs.length >= WEB_TAB_LIMIT} onClick={onAdd}><Icon name="plus" size={13}/></ThemedTooltipButton>
    {context.menu && <TabActionMenu {...context.menu} label="网页标签操作" keepOnInternalScroll items={(Object.keys(webTabCloseLabels) as WebTabCloseAction[]).map(id => ({ id, label: webTabCloseLabels[id], count: webTabCloseTargets(ids, context.menu!.anchorId, id).length }))} onDismiss={context.dismiss} onChoose={action => {
      if (!context.menu) return;
      const anchor = context.menu.anchorId;
      const targets = webTabCloseTargets(ids, anchor, action);
      context.dismiss(false); if (targets.length) onClose(targets, anchor);
    }}/>}
  </div>;
}
