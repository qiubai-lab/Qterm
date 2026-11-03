import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { closeCurrentWindow, currentDesktopPlatform, isCurrentWindowAlwaysOnTop, minimizeCurrentWindow, setCurrentWindowAlwaysOnTop, toggleMaximizeCurrentWindow } from "../lib/tauri/window";
export function NativeWindowControls() {
  const usesNativeWindowControls = currentDesktopPlatform() === "macos";
  const [windowAlwaysOnTop, setWindowAlwaysOnTop] = useState(false);
  const [windowPinBusy, setWindowPinBusy] = useState(false);
  async function toggleWindowAlwaysOnTop() {
    if (windowPinBusy) return;
    const next = !windowAlwaysOnTop;
    setWindowPinBusy(true);
    try {
      await setCurrentWindowAlwaysOnTop(next);
      setWindowAlwaysOnTop(next);
    } catch {
      // Keep the visible state aligned with the last confirmed native state.
    } finally {
      setWindowPinBusy(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    void isCurrentWindowAlwaysOnTop().then((value) => {
      if (!disposed) setWindowAlwaysOnTop(value);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  return (      <div className="window-controls" aria-label="窗口控制">
        <button className="window-pin" aria-label={windowAlwaysOnTop ? "取消窗口置顶" : "置顶窗口"} aria-pressed={windowAlwaysOnTop} aria-busy={windowPinBusy || undefined} title={windowAlwaysOnTop ? "取消置顶" : "置顶窗口"} disabled={windowPinBusy} onClick={() => void toggleWindowAlwaysOnTop()}><Icon name="pin" size={14}/></button>
        {!usesNativeWindowControls && <>
          <button aria-label="最小化窗口" title="最小化" onClick={() => void minimizeCurrentWindow()}><Icon name="windowMinimize" size={14}/></button>
          <button aria-label="最大化或还原窗口" title="最大化或还原" onClick={() => void toggleMaximizeCurrentWindow()}><Icon name="windowMaximize" size={12}/></button>
          <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void closeCurrentWindow()}><Icon name="close" size={14}/></button>
        </>}
      </div>);
}
