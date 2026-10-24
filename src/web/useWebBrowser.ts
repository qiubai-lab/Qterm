import { useEffect, useRef, useState, type RefObject } from "react";
import { closeWeb, listenWebFocus, listenWebPages, openWeb, syncWeb, webAction, type WebBounds } from "../lib/tauri/web";
import { normalizeWebAddress, webSurfaceVisible } from "./webModel";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfaceFrame } from "./webSurfaceFrame";

/** A generation owns exactly one guest; closing waits for pending creation. */
export function useWebBrowser(surface: RefObject<HTMLDivElement | null>, sessionId: string | null, profileId: string | null, visible: boolean, onActivate?: () => void) {
  const [request, setRequest] = useState<{ url: string; generation: number } | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const current = useRef<string | null>(null);
  const latestUrl = useRef("");
  const visibility = useRef(visible);
  visibility.current = visible;
  const activate = useRef(onActivate);
  activate.current = onActivate;

  useEffect(() => {
    if (!request || !sessionId || !profileId) { setReady(false); setLoading(false); return; }
    const id = crypto.randomUUID();
    let disposed = false;
    let frame = 0;
    let unlisten: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    let lastBounds = "";
    let syncing = false;
    current.current = id;
    setLoading(true);
    setReady(false);
    setError("");
    const created = (async () => {
      unlisten = await listenWebPages(page => {
        if (disposed || page.label !== `web-${id}`) return;
        setAddress(page.url);
        latestUrl.current = page.url;
        setLoading(page.loading);
      });
      if (disposed) return;
      unlistenFocus = await listenWebFocus(label => {
        if (!disposed && label === `web-${id}` && surface.current && webSurfaceVisible(surface.current, visibility.current)) activate.current?.();
      });
      if (disposed) return;
      await openWeb(id, sessionId, profileId, latestUrl.current || request.url);
      if (disposed) return;
      setReady(true);
      const update = () => {
        if (disposed) return;
        frame = requestAnimationFrame(update);
        const element = surface.current;
        if (!element || syncing) return;
        const rect = element.getBoundingClientRect();
        const bounds: WebBounds = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.max(1, rect.width), height: Math.max(1, rect.height), visible: rect.width > 1 && rect.height > 1 && webSurfaceVisible(element, visibility.current), occlusions: webSurfaceOcclusions(rect), frame: webSurfaceFrame(rect) };
        const key = JSON.stringify([bounds, window.devicePixelRatio]);
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
      void created.finally(() => { unlisten?.(); unlistenFocus?.(); void closeWeb(id).catch(() => undefined); });
    };
  }, [profileId, request, sessionId, surface]);

  async function navigate(value: string) {
    try {
      const url = normalizeWebAddress(value);
      setError(""); setAddress(url);
      latestUrl.current = url;
      if (current.current && ready) await webAction(current.current, "navigate", url);
      else setRequest(previous => ({ url, generation: (previous?.generation ?? 0) + 1 }));
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); return false; }
  }
  async function action(action: "back" | "forward" | "reload") {
    if (!current.current) return;
    try { await webAction(current.current, action); setError(""); } catch (err) { setError(String(err)); }
  }
  return { navigate, action, address, error, loading, ready: Boolean(sessionId) && ready };
}
