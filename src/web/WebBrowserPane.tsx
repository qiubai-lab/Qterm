import { useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";
import { useWebBrowser } from "./useWebBrowser";

interface Props {
  profileId: string | null;
  sessionId: string | null;
  connecting: boolean;
  visible: boolean;
  supported: boolean;
  notice: string;
  onConnect: () => void;
  onActivate: () => void;
}

/** Profile-keyed browsing state is discarded when the block changes connection. */
export function WebBrowserPane({ profileId, sessionId, connecting, visible, supported, notice, onConnect, onActivate }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const browser = useWebBrowser(surface, sessionId, profileId, visible, onActivate);
  const [draft, setDraft] = useState<string | null>(null);

  return <>
    <form className="web-address-bar" onSubmit={event => {
      event.preventDefault();
      void browser.navigate(draft ?? browser.address).then(valid => {
        if (!valid) return;
        setDraft(null);
        if (!sessionId && !connecting && supported) onConnect();
      });
    }}>
      {(["back", "forward", "reload"] as const).map((action, index) => <ThemedTooltipButton key={action} type="button" tooltip={["后退", "前进", "刷新网页"][index]} aria-label={["后退", "前进", "刷新网页"][index]} disabled={!browser.ready} onClick={() => void browser.action(action)}><Icon name={action === "reload" ? "refresh" : action} size={13}/></ThemedTooltipButton>)}
      <input aria-label="网页地址" placeholder="http://127.0.0.1:3000" value={draft ?? browser.address} onChange={event => setDraft(event.target.value)} disabled={!supported || !profileId} spellCheck={false}/>
      <ThemedTooltipButton type="submit" tooltip="打开网页" aria-label="打开" disabled={!supported || !profileId || connecting}><Icon name="forward" size={13}/></ThemedTooltipButton>
    </form>
    <div className="web-browser-surface" ref={surface}>
      {!browser.ready && <div className="web-empty-state"><Icon name="browser" size={24}/><strong>{!supported ? "目前仅支持 Windows 桌面版" : browser.loading ? "正在打开网页…" : "通过此连接访问网页"}</strong><span>输入地址后打开。localhost 指向远程服务器。</span></div>}
    </div>
    <div className="web-feedback" role={browser.error || notice ? "alert" : "status"}>{browser.error || notice || (browser.loading ? "正在加载网页…" : sessionId ? "SSH 代理 · 独立浏览会话" : "连接后可访问远程网络")}</div>
  </>;
}
