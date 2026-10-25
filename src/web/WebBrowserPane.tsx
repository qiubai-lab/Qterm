import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usesTunnelAddressMapping } from "../lib/tauri/webCapabilities";
import { Icon } from "../components/Icon";
import { WebAddressBar } from "./WebAddressBar";
import { useWebBrowser } from "./useWebBrowser";
import { useWebLibrary } from "./useWebLibrary";
import { WebLibraryDialog } from "./WebLibraryDialog";
import { WebFeedback } from "./WebFeedback";
import type { WebTabMetadata } from "./WebTabs";
import { useWebLibraryDrawer } from "./useWebLibraryDrawer";
import type { WebPopupRequest } from "../lib/tauri/webPopups";

interface Props {
  initialPopup?: WebPopupRequest;
  onNewWindow?: (request: WebPopupRequest) => void;
  onWindowClose?: () => void;
  initialAddress?: string;
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
export function WebBrowserPane({ initialAddress, initialPopup, onNewWindow, onWindowClose, profileId, profileName = "当前连接", sessionId, connecting, visible, supported, notice, onConnect, onActivate, onMetadata }: Props) {
  const [guestInteraction, setGuestInteraction] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const library = useWebLibrary(profileId);
  const drawer = useWebLibraryDrawer();
  const browser = useWebBrowser(surface, sessionId, profileId, visible, () => {
    drawer.close();
    setGuestInteraction(value => value + 1);
    onActivate();
  }, library.record, { initial: initialPopup, onRequest: onNewWindow, onClose: onWindowClose });
  useEffect(() => { onMetadata?.({ title: browser.title, address: browser.address, loading: browser.loading }); }, [browser.title, browser.address, browser.loading, onMetadata]);
  const bookmarked = library.data.bookmarks.some(entry => entry.url === browser.address);
  const navigate = (url: string) => browser.navigate(url).then(valid => {
    if (!valid) return false;
    drawer.close();
    if (profileId !== null && !sessionId && !connecting && supported) onConnect();
    return true;
  });
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; });
  const consumedAddress = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialAddress || !supported || consumedAddress.current === initialAddress) return;
    consumedAddress.current = initialAddress;
    void navigateRef.current(initialAddress);
  }, [initialAddress, supported]);
  const feedback = browser.error || notice || library.error;

  return <>
    <WebAddressBar profileName={profileName} onClearData={browser.clearData} dataDismissKey={guestInteraction} visible={visible} history={library.data.history} address={browser.address} ready={browser.ready} loading={browser.loading} disabled={!supported} connecting={connecting} bookmarked={bookmarked} bookmarkBusy={library.busy} libraryOpen={drawer.open} onNavigate={navigate} onAction={action => void browser.action(action)} onBookmark={() => void library.update(bookmarked ? { kind: "unbookmark", url: browser.address } : { kind: "bookmark", url: browser.address, title: browser.title || new URL(browser.address).host })} onLibrary={() => drawer.open ? drawer.close() : drawer.show()}/>
    <div className="web-browser-surface" ref={surface}>
      {!browser.ready && <div className="web-empty-state"><Icon name="browser" size={24}/><strong>{!supported ? notice || "需要 Windows 或 macOS 14 及以上桌面版" : browser.loading ? "正在打开网页…" : "通过此连接访问网页"}</strong><span>输入地址后按 Enter 访问。localhost 指向{profileId === null ? "当前电脑" : "远程服务器"}。{profileId !== null && usesTunnelAddressMapping() ? "远程 HTTP 地址将使用专用隧道域名；HTTPS localhost 和依赖原始地址的登录可能不兼容。" : ""}</span></div>}
      {drawer.present && <WebLibraryDialog phase={drawer.phase} profileName={profileName} data={library.data} busy={library.busy} error={library.error} onUpdate={library.update} onOpen={navigate} onClose={drawer.close}/>}
    </div>
    <WebFeedback feedback={feedback} loading={browser.loading} ready={browser.ready} connected={supported && (profileId === null || Boolean(sessionId))} local={profileId === null} loadState={browser.loadState} metrics={browser.metrics}/>
  </>;
}
