import { useEffect, useState } from "react";
import type { AppTheme } from "../../lib/tauri/settings";
import { useTerminalImageAction } from "./useTerminalImageAction";
import { IMAGE_SCALE, imageExportError, type TerminalImageSnapshot, type TerminalImageStyle, type TerminalImageScale } from "./terminalImageModel";
import { renderTerminalImage, type RenderedTerminalImage } from "./renderTerminalImage";

export function useTerminalImagePreview(snapshot: TerminalImageSnapshot | null, style: TerminalImageStyle, theme: AppTheme, scale: TerminalImageScale = IMAGE_SCALE) {
  const [result, setResult] = useState<{ key: string; image?: RenderedTerminalImage; error?: string } | null>(null);
  const key = `${style}:${theme}:${scale}`;
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void renderTerminalImage(snapshot, style, theme, scale).then(image => {
      if (cancelled) { image.dispose(); return; }
      setResult({ key, image });
    }, reason => {
      if (!cancelled) setResult({ key, error: imageExportError(reason, "图片生成失败，请重新打开导出") });
    });
    return () => { cancelled = true; };
  }, [key, snapshot, style, theme, scale]);
  // Keep the previous preview alive until its replacement is committed.
  useEffect(() => () => result?.image?.dispose(), [result]);
  const image = result?.key === key ? result.image : undefined;
  const renderError = result?.key === key ? result.error : undefined;

  const action = useTerminalImageAction(image, key);
  return { image, displayImage: result?.image, pending: result?.key !== key && !!snapshot, renderError, ...action };
}
