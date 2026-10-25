import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { WebAddressBar } from "./WebAddressBar";
import { useWebBrowser } from "./useWebBrowser";
import { useWebLibrary } from "./useWebLibrary";
import { WebLibraryDialog } from "./WebLibraryDialog";
import { WebFeedback } from "./WebFeedback";
import type { WebTabMetadata } from "./WebTabs";
import { useWebLibraryDrawer } from "./useWebLibraryDrawer";

interface Props {
  onMetadata?: (state: WebTabMetadata) => void;
  profileId: string | null;
  profileName?: string;
  sessionId: string | null;
  connecting: boolean;
  visible: boolean;
  supported: boolean;
  notice: string;
  onConnect: () => void;
  onActivate: () => void;
}

/** Profile-keyed browsing state is discarded when the block changes connection. */
export function WebBrowserPane({ profileId, profileName = "当前连接", sessionId, connecting, visible, supported, notice, onConnect, onActivate, onMetadata }: Props) {
  const [guestInteraction, setGuestInteraction] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const library = useWebLibrary(profileId);
  const drawer = useWebLibraryDrawer();
  const browser = useWebBrowser(surface, sessionId, profileId, visible, () => {
    drawer.close();
    setGuestInteraction(value => value + 1);
    onActivate();
  }, library.record);
  useEffect(() => { onMetadata?.({ title: browser.title, address: browser.address, loading: browser.loading }); }, [browser.title, browser.address, browser.loading, onMetadata]);
  const bookmarked = library.data.bookmarks.some(entry => entry.url === browser.address);
  const navigate = (url: string) => browser.navigate(url).then(valid => {
    if (!valid) return false;
    drawer.close();
    if (!sessionId && !connecting && supported) onConnect();
    return true;
  });
  const feedback = browser.error || notice || library.error;

  return <>
    <WebAddressBar profileName={profileName} onClearData={browser.clearData} dataDismissKey={guestInteraction} visible={visible} history={library.data.history} address={browser.address} ready={browser.ready} loading={browser.loading} disabled={!supported || !profileId} connecting={connecting} bookmarked={bookmarked} bookmarkBusy={library.busy} libraryOpen={drawer.open} onNavigate={navigate} onAction={action => void browser.action(action)} onBookmark={() => void library.update(bookmarked ? { kind: "unbookmark", url: browser.address } : { kind: "bookmark", url: browser.address, title: browser.title || new URL(browser.address).host })} onLibrary={() => drawer.open ? drawer.close() : drawer.show()}/>
    <div className="web-browser-surface" ref={surface}>
      {!browser.ready && <div className="web-empty-state"><Icon name="browser" size={24}/><strong>{!supported ? "目前仅支持 Windows 桌面版" : browser.loading ? "正在打开网页…" : "通过此连接访问网页"}</strong><span>输入地址后按 Enter 访问。localhost 指向远程服务器。</span></div>}
      {drawer.present && <WebLibraryDialog phase={drawer.phase} profileName={profileName} data={library.data} busy={library.busy} error={library.error} onUpdate={library.update} onOpen={navigate} onClose={drawer.close}/>}
    </div>
    <WebFeedback feedback={feedback} loading={browser.loading} ready={browser.ready} connected={Boolean(sessionId)} loadState={browser.loadState} metrics={browser.metrics}/>
  </>;
}
