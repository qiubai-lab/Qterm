import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clearWebData, type WebDataSelection, closeWeb, listenWebFocus, listenWebPages, openWeb, webAction, type WebLoadState, type WebMetrics } from "../lib/tauri/web";
import { normalizeWebAddress, webSurfaceVisible } from "./webModel";
import { registerNativeSurface } from "./surface/nativeSurfaceCoordinator";
import { dispatchNativeInteraction } from "../components/overlays/nativeInteraction";
import { watchWebMetrics } from "./watchWebMetrics";
import { acceptWebPopup, rejectWebPopup, type WebPopupRequest } from "../lib/tauri/webPopups";
import { watchWebPopups, type WebPopupOptions } from "./webPopupEvents";

/** A generation owns exactly one guest; closing waits for pending creation. */
export function useWebBrowser(surface: RefObject<HTMLDivElement | null>, sessionId: string | null, profileId: string | null, visible: boolean, onActivate?: () => void, onVisit?: (url: string, title: string, metadata: boolean) => void, popups?: WebPopupOptions) {
  const [request, setRequest] = useState<{ url: string; generation: number; popup?: WebPopupRequest } | null>(() => popups?.initial ? { url: popups.initial.url, generation: 0, popup: popups.initial } : null);
  const popupOptions = useRef(popups);
  useLayoutEffect(() => { popupOptions.current = popups; }, [popups]);
  const adoptedPopup = useRef(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState<WebMetrics | null>(null);
  const [loadState, setLoadState] = useState<WebLoadState>("idle");
  const current = useRef<string | null>(null);
  const latestUrl = useRef("");
  const visibility = useRef(visible);
  visibility.current = visible;
  const activate = useRef(onActivate);
  activate.current = onActivate;
  const visited = useRef(onVisit);
  visited.current = onVisit;

  useEffect(() => {
    if (!request || (profileId !== null && !sessionId)) { setReady(false); setLoading(false); return; }
    const id = crypto.randomUUID();
    let disposed = false;
    let unregisterSurface: (() => void) | undefined;
    let unlisten: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    let documentRevision = 0, snapshotReady = false;
    let metricWatcher: ReturnType<typeof watchWebMetrics> | undefined;
    let popupWatcher: ReturnType<typeof watchWebPopups> | undefined;
    current.current = id;
    setLoading(true);
    setReady(false);
    setError("");
    setMetrics(null);
    setLoadState("loading");
    const created = (async () => {
      unlisten = await listenWebPages(page => {
        if (disposed || page.label !== `web-${id}`) return;
        if (!page.metadata) documentRevision++;
        snapshotReady = !page.loading;
        setAddress(page.url);
        setTitle(page.title ?? "");
        latestUrl.current = page.url;
        setLoading(page.loading);
        if (page.error !== undefined) setError(page.error);
        setLoadState(page.loadState ?? (page.loading ? "loading" : page.visited ? "loaded" : "idle"));
        if (page.loading) metricWatcher?.reset();
        else metricWatcher?.settled();
        if (page.visited || page.metadata) visited.current?.(page.url, page.title ?? "", Boolean(page.metadata));
      });
      if (disposed) return;
      unlistenFocus = await listenWebFocus(label => {
        if (!disposed && label === `web-${id}` && surface.current && webSurfaceVisible(surface.current, visibility.current)) {
          dispatchNativeInteraction(surface.current);
          activate.current?.();
        }
      });
      if (disposed) return;
      if (popupOptions.current) {
        popupWatcher = watchWebPopups(id, () => popupOptions.current ?? {}, reason => { if (!disposed) setError(reason); });
        await popupWatcher.ready;
      }
      if (disposed) return;
      if (request.popup && !adoptedPopup.current) {
        await acceptWebPopup(id, request.popup.requestId);
        adoptedPopup.current = true;
        if (!disposed && request.popup.url === "about:blank" && !latestUrl.current) {
          // A script may write into its new blank window without starting a navigation.
          snapshotReady = true; setLoading(false); setLoadState("idle");
        }
      } else await openWeb(id, sessionId, profileId, latestUrl.current || request.url);
      if (disposed) return;
      setReady(true);
      metricWatcher = watchWebMetrics(id, () => visibility.current, value => {
        if (!disposed && (!value || value.url === latestUrl.current)) setMetrics(value);
      });
      if (surface.current) unregisterSurface = registerNativeSurface({ id, element: surface.current,
        visible: () => visibility.current, revision: () => documentRevision, url: () => latestUrl.current, snapshotReady: () => snapshotReady,
        onError: reason => { if (!disposed) setError(reason); } });
    })().catch(err => { if (!disposed) { setLoading(false); setError(String(err)); } });
    return () => {
      disposed = true;
      if (current.current === id) current.current = null;
      unregisterSurface?.();
      metricWatcher?.dispose();
      popupWatcher?.dispose();
      void created.finally(() => {
        unlisten?.(); unlistenFocus?.(); void closeWeb(id).catch(() => undefined);
        if (request.popup && !adoptedPopup.current && current.current === null) void rejectWebPopup(request.popup.requestId).catch(() => undefined);
      });
    };
  }, [profileId, request, sessionId, surface]);

  async function navigate(value: string) {
    try {
      const url = normalizeWebAddress(value);
      setError(""); setAddress(url); setTitle("");
      latestUrl.current = url;
      if (current.current && ready) await webAction(current.current, "navigate", url);
      else setRequest(previous => ({ url, generation: (previous?.generation ?? 0) + 1 }));
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); return false; }
  }
  async function action(action: "back" | "forward" | "reload" | "stop") {
    if (!current.current) return;
    const id = current.current;
    try { await webAction(id, action); if (current.current === id) setError(""); } catch (err) { if (current.current === id) setError(String(err)); }
  }
  async function clearData(selection: WebDataSelection) {
    if (!current.current) throw new Error("请先打开网页");
    await clearWebData(current.current, selection);
  }
  return { navigate, action, clearData, address, title, error, loading, loadState, metrics, ready: (profileId === null || Boolean(sessionId)) && ready };
}
