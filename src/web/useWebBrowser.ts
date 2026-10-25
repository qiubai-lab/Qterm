import { useEffect, useRef, useState, type RefObject } from "react";
import { clearWebData, type WebDataSelection, closeWeb, listenWebFocus, listenWebPages, openWeb, syncWeb, webAction, type WebBounds, type WebLoadState, type WebMetrics } from "../lib/tauri/web";
import { normalizeWebAddress, webSurfaceVisible } from "./webModel";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfacePanels } from "./webSurfacePanels";
import { webSurfaceFrame } from "./webSurfaceFrame";
import { webScrollbarTheme } from "./webScrollbarTheme";
import { watchWebMetrics } from "./watchWebMetrics";

/** A generation owns exactly one guest; closing waits for pending creation. */
export function useWebBrowser(surface: RefObject<HTMLDivElement | null>, sessionId: string | null, profileId: string | null, visible: boolean, onActivate?: () => void, onVisit?: (url: string, title: string, metadata: boolean) => void) {
  const [request, setRequest] = useState<{ url: string; generation: number } | null>(null);
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
    if (!request || !sessionId || !profileId) { setReady(false); setLoading(false); return; }
    const id = crypto.randomUUID();
    let disposed = false;
    let frame = 0;
    let unlisten: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    let lastBounds = "";
    let documentRevision = 0;
    let syncing = false;
    let hidden = false;
    let metricWatcher: ReturnType<typeof watchWebMetrics> | undefined;
    current.current = id;
    setLoading(true);
    setReady(false);
    setError("");
    setMetrics(null);
    setLoadState("loading");
    const created = (async () => {
      unlisten = await listenWebPages(page => {
        if (disposed || page.label !== `web-${id}`) return;
        if (!page.loading && !page.metadata) documentRevision++;
        setAddress(page.url);
        setTitle(page.title ?? "");
        latestUrl.current = page.url;
        setLoading(page.loading);
        setLoadState(page.loadState ?? (page.loading ? "loading" : page.visited ? "loaded" : "idle"));
        if (page.loading) metricWatcher?.reset();
        else metricWatcher?.settled();
        if (page.visited || page.metadata) visited.current?.(page.url, page.title ?? "", Boolean(page.metadata));
      });
      if (disposed) return;
      unlistenFocus = await listenWebFocus(label => {
        if (!disposed && label === `web-${id}` && surface.current && webSurfaceVisible(surface.current, visibility.current)) activate.current?.();
      });
      if (disposed) return;
      await openWeb(id, sessionId, profileId, latestUrl.current || request.url);
      if (disposed) return;
      setReady(true);
      metricWatcher = watchWebMetrics(id, () => visibility.current, value => {
        if (!disposed && (!value || value.url === latestUrl.current)) setMetrics(value);
      });
      const update = () => {
        if (disposed) return;
        frame = requestAnimationFrame(update);
        const element = surface.current;
        if (!element || syncing) return;
        if (!visibility.current) {
          if (!hidden) {
            hidden = true; lastBounds = ""; syncing = true;
            void syncWeb(id, { x: 0, y: 0, width: 1, height: 1, visible: false }).catch(err => { hidden = false; if (!disposed) setError(String(err)); }).finally(() => { syncing = false; });
          }
          return;
        }
        hidden = false;
        const rect = element.getBoundingClientRect();
        const bounds: WebBounds = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.max(1, rect.width), height: Math.max(1, rect.height), visible: rect.width > 1 && rect.height > 1 && webSurfaceVisible(element, visibility.current), occlusions: webSurfaceOcclusions(rect), frame: webSurfaceFrame(rect), panels: webSurfacePanels(rect), scrollbar: webScrollbarTheme() };
        const key = JSON.stringify([bounds, window.devicePixelRatio, documentRevision]);
        if (key === lastBounds) return;
        syncing = true;
        void syncWeb(id, bounds).then(() => { lastBounds = key; }, err => { if (!disposed) setError(String(err)); }).finally(() => { syncing = false; });
      };
      update();
    })().catch(err => { if (!disposed) { setLoading(false); setError(String(err)); } });
    return () => {
      disposed = true;
      if (current.current === id) current.current = null;
      cancelAnimationFrame(frame);
      metricWatcher?.dispose();
      void created.finally(() => { unlisten?.(); unlistenFocus?.(); void closeWeb(id).catch(() => undefined); });
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
  return { navigate, action, clearData, address, title, error, loading, loadState, metrics, ready: Boolean(sessionId) && ready };
}
