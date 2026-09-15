import { useEffect, useRef, useState } from "react";
import type { AppTheme } from "../../lib/tauri/settings";
import { copyImageUrlToClipboard } from "../../lib/tauri/clipboard";
import { saveTerminalImage } from "../../lib/tauri/terminalImage";
import { IMAGE_FEEDBACK_ERROR_MS, IMAGE_FEEDBACK_SUCCESS_MS, imageExportError, type TerminalImageFeedback, type TerminalImageSnapshot, type TerminalImageStyle } from "./terminalImageModel";
import { renderTerminalImage, type RenderedTerminalImage } from "./renderTerminalImage";

export function useTerminalImagePreview(snapshot: TerminalImageSnapshot | null, style: TerminalImageStyle, theme: AppTheme) {
  const [result, setResult] = useState<{ key: string; image?: RenderedTerminalImage; error?: string } | null>(null);
  const [operation, setOperation] = useState<"copy" | "save" | null>(null);
  const [feedback, setFeedback] = useState<(TerminalImageFeedback & { key: string }) | null>(null);
  const feedbackId = useRef(0);
  const mounted = useRef(false);
  const running = useRef(false);
  const key = `${style}:${theme}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(current => current === feedback ? null : current), feedback.error ? IMAGE_FEEDBACK_ERROR_MS : IMAGE_FEEDBACK_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void renderTerminalImage(snapshot, style, theme).then(image => {
      if (cancelled) { image.dispose(); return; }
      setResult({ key, image });
    }, reason => {
      if (!cancelled) setResult({ key, error: imageExportError(reason, "图片生成失败，请重新打开导出") });
    });
    return () => { cancelled = true; };
  }, [key, snapshot, style, theme]);
  // Keep the previous preview alive until its replacement is committed.
  useEffect(() => () => result?.image?.dispose(), [result]);
  const image = result?.key === key ? result.image : undefined;
  const renderError = result?.key === key ? result.error : undefined;

  async function run(action: "copy" | "save") {
    if (!image || running.current) return;
    running.current = true;
    setOperation(action);
    setFeedback(null);
    try {
      if (action === "copy") {
        await copyImageUrlToClipboard(image.url);
        if (mounted.current) setFeedback({ key, id: ++feedbackId.current, action, message: "图片已复制", error: false });
      } else {
        const path = await saveTerminalImage(image.blob);
        if (mounted.current && path !== null) setFeedback({ key, id: ++feedbackId.current, action, message: "图片已保存", error: false });
      }
    } catch (reason) {
      if (mounted.current) setFeedback({ key, id: ++feedbackId.current, action, message: imageExportError(reason, action === "copy" ? "复制失败，请重试或保存图片" : "保存失败，请重试"), error: true });
    } finally {
      running.current = false;
      if (mounted.current) setOperation(null);
    }
  }
  return { image, displayImage: result?.image, pending: result?.key !== key && !!snapshot, renderError, operation, feedback: feedback?.key === key ? feedback : null, clearFeedback: () => setFeedback(null), run };
}
