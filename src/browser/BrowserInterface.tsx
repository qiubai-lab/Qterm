import { useEffect, useState, type ReactNode } from "react";
import { bindBrowserViewport } from "./browserViewport";
import "./browserInterface.css";

import { BrowserInterfaceContext, defaults, type Preferences } from "./browserInterfaceContext";
const storageKey = "qterm.browser-interface.v1";
function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return { mode: ["auto", "desktop", "touch"].includes(value?.mode) ? value.mode : "auto", keybar: ["auto", "show", "hide"].includes(value?.keybar) ? value.keybar : "auto" };
  } catch { return defaults; }
}
/** Device-local presentation only; never changes runtime selection or server settings. */
export function BrowserInterface({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [coarse, setCoarse] = useState(() => window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const touch = enabled && (preferences.mode === "touch" || (preferences.mode === "auto" && coarse));
  useEffect(() => {
    if (!enabled || !window.matchMedia) return;
    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.browserInterface = touch ? "touch" : "desktop";
    return () => { delete root.dataset.browserInterface; };
  }, [enabled, touch]);
  useEffect(() => enabled ? bindBrowserViewport() : undefined, [enabled]);
  const update = (value: Partial<Preferences>) => setPreferences(current => {
    const next = { ...current, ...value };
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Private/storage-disabled browsers retain this page's preference. */ }
    return next;
  });
  return <BrowserInterfaceContext value={{ enabled, touch, preferences, update, showKeybar: enabled && (preferences.keybar === "show" || (preferences.keybar === "auto" && touch)) }}>{children}</BrowserInterfaceContext>;
}
