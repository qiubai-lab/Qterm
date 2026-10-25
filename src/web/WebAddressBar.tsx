import { useId, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";

import type { WebEntry } from "../lib/tauri/webLibrary";
import { WebDataPopover } from "./WebDataPopover";
import type { WebDataSelection } from "../lib/tauri/web";
import { WebAddressHistory } from "./WebAddressHistory";

interface Props {
  profileName?: string;
  dataDismissKey?: number;
  onClearData?: (selection: WebDataSelection) => Promise<void>;
  visible?: boolean;
  history?: WebEntry[];
  address: string;
  ready: boolean;
  loading: boolean;
  disabled: boolean;
  connecting: boolean;
  bookmarked: boolean;
  bookmarkBusy: boolean;
  libraryOpen: boolean;
  onNavigate: (url: string) => Promise<boolean>;
  onAction: (action: "back" | "forward" | "reload" | "stop") => void;
  onBookmark: () => void;
  onLibrary: () => void;
}

/** A draft belongs to the editor; native route updates continue behind it. */
export function WebAddressBar(props: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(-1);
  if (expanded && (props.visible === false || props.disabled)) setExpanded(false);
  const skipFocus = useRef(false);
  const recent = [...(props.history ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const showHistory = () => { setExpanded(true); setSelected(-1); };
  const moreHistory = () => { setExpanded(false); skipFocus.current = true; props.onLibrary(); };
  const choose = (index: number) => {
    if (index === recent.length) { moreHistory(); return; }
    if (props.disabled || props.connecting || !recent[index]) return;
    setExpanded(false);
    const submitted = version.current;
    void props.onNavigate(recent[index].url).then(valid => { if (valid && submitted === version.current) reset(); });
  };
  const version = useRef(0);
  const composing = useRef(false);
  const reset = () => { version.current++; setDraft(null); };
  const refreshAction = props.loading ? "stop" : "reload";
  const refreshLabel = props.loading ? "停止加载" : "刷新网页";
  return <form className="web-address-bar" onSubmit={event => {
    event.preventDefault();
    if (composing.current || props.disabled || props.connecting) return;
    setExpanded(false);
    const submitted = version.current;
    void props.onNavigate(draft ?? props.address).then(valid => { if (valid && submitted === version.current) reset(); });
  }}>
    {(["back", "forward"] as const).map((action, index) => <ThemedTooltipButton tooltipPlacement="above" key={action} type="button" tooltip={["后退", "前进"][index]} aria-label={["后退", "前进"][index]} disabled={!props.ready} onClick={() => props.onAction(action)}><Icon name={action} size={13}/></ThemedTooltipButton>)}
    <ThemedTooltipButton tooltipPlacement="above" type="button" tooltip={refreshLabel} aria-label={refreshLabel} disabled={!props.ready} onClick={() => props.onAction(refreshAction)}><Icon name={props.loading ? "close" : "refresh"} size={13}/></ThemedTooltipButton>
    <span className="web-address-loading" data-loading={props.loading || undefined} role={props.loading ? "progressbar" : undefined} aria-label={props.loading ? "网页加载中" : undefined} aria-hidden={!props.loading || undefined}>{props.loading ? <span className="web-address-spinner"/> : <Icon name="browser" size={12}/>}</span>
    <div className="web-address-field" ref={field}>
    {props.onClearData && <WebDataPopover disabled={!props.ready} profileName={props.profileName ?? "当前连接"} onClear={props.onClearData} dismissKey={props.dataDismissKey}/>}
    <input ref={input} role="combobox" aria-autocomplete="none" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && selected >= 0 ? `${listId}-${selected}` : undefined} onFocus={() => { if (!skipFocus.current) showHistory(); skipFocus.current = false; }} onClick={showHistory} aria-label="网页地址" placeholder="输入地址，按 Enter 访问" value={draft ?? props.address} onChange={event => { version.current++; setSelected(-1); setDraft(event.target.value); }} onBlur={() => { setExpanded(false); reset(); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === "Enter") event.preventDefault(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); setExpanded(true);
        setSelected(previous => previous < 0 ? (event.key === "ArrowDown" ? 0 : recent.length) : (previous + (event.key === "ArrowDown" ? 1 : recent.length)) % (recent.length + 1));
      }
      if (event.key === "Enter" && expanded && selected >= 0) { event.preventDefault(); choose(selected); }
      if (event.key === "Escape" && expanded) { event.stopPropagation(); setExpanded(false); }
      if (event.key === "Escape") { event.preventDefault(); reset(); }
    }} disabled={props.disabled} spellCheck={false}/>
    </div>
    <ThemedTooltipButton tooltipPlacement="above" type="button" tooltip={props.bookmarked ? "取消收藏" : "收藏当前网页"} aria-label={props.bookmarked ? "取消收藏当前网页" : "收藏当前网页"} aria-pressed={props.bookmarked} disabled={!props.ready || !props.address || props.bookmarkBusy || props.loading} onClick={props.onBookmark}><Icon name="bookmark" size={13}/></ThemedTooltipButton>
    <ThemedTooltipButton tooltipPlacement="above" type="button" tooltip="访问历史与收藏" aria-label="访问历史与收藏" aria-haspopup="dialog" aria-expanded={props.libraryOpen} disabled={props.disabled} onClick={moreHistory}><Icon name="history" size={13}/></ThemedTooltipButton>
    {!props.disabled && props.visible !== false && !props.libraryOpen && <WebAddressHistory open={expanded} id={listId} anchor={field} entries={recent} selected={selected} onSelect={setSelected} onChoose={choose}/>}
  </form>;
}
