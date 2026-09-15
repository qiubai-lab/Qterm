import { useEffect, useRef, useState } from "react";
import { copyImageUrlToClipboard } from "@qterm/services/clipboard";
import { saveTerminalImage } from "@qterm/services/terminalImage";
import type { RenderedTerminalImage } from "./renderTerminalImage";
import { IMAGE_FEEDBACK_ERROR_MS, IMAGE_FEEDBACK_SUCCESS_MS, imageExportError, type TerminalImageFeedback } from "./terminalImageModel";

export const IMAGE_ACTION_CYCLE_MS = 700;

export function useTerminalImageAction(image: RenderedTerminalImage | undefined, key: string) {
  const [operation, setOperation] = useState<"copy" | "save" | null>(null);
  const [feedback, setFeedback] = useState<(TerminalImageFeedback & { key: string }) | null>(null);
  const feedbackId = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(current => current === feedback ? null : current), feedback.error ? IMAGE_FEEDBACK_ERROR_MS : IMAGE_FEEDBACK_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function run(action: "copy" | "save") {
    if (!image || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const start = performance.now();
    setOperation(action);
    setFeedback(null);
    let outcome: Omit<TerminalImageFeedback, "id"> | null = null;
    try {
      if (action === "copy") {
        await copyImageUrlToClipboard(image.url);
        outcome = { action, message: "图片已复制", error: false };
      } else if (await saveTerminalImage(image.blob) !== null) {
        outcome = { action, message: "图片已保存", error: false };
      }
    } catch (reason) {
      outcome = { action, message: imageExportError(reason, action === "copy" ? "复制失败，请重试或保存图片" : "保存失败，请重试"), error: true };
    }
    // Complete the current revolution before turning the ring into a success mark.
    // Native work starts immediately; reduced motion skips this visual settling time.
    if (!controller.signal.aborted && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const elapsed = performance.now() - start;
      const duration = Math.max(1, Math.ceil(elapsed / IMAGE_ACTION_CYCLE_MS)) * IMAGE_ACTION_CYCLE_MS - elapsed;
      await settleCycle(duration, controller.signal);
    }
    if (controller.signal.aborted) return;
    if (outcome) setFeedback({ ...outcome, key, id: ++feedbackId.current });
    active.current = null;
    setOperation(null);
  }
  return { operation, feedback: feedback?.key === key ? feedback : null, clearFeedback: () => setFeedback(null), run };
}

function settleCycle(duration: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => { window.clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = window.setTimeout(finish, duration);
    signal.addEventListener("abort", finish, { once: true });
  });
}
