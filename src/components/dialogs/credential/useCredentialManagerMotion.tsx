import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { CredentialSummary } from "../../../lib/tauri/credentials";

type EditorTransition = "idle" | "switching-down" | "switching-up" | "creating";
export type CredentialSelectionState = { offset: number; ready: boolean; targetId: string | null; visible: boolean };

export function useCredentialManagerMotion({ selectedId, items }: { selectedId: string | null; items: CredentialSummary[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeExitRef = useRef<Animation | null>(null);
  const pendingItemRef = useRef<string | null>(null);
  const pendingUpdateRef = useRef<(() => void) | null>(null);
  const editorTargetRef = useRef<string | null | undefined>(undefined);
  const indicatorReadyRef = useRef(false);
  const [selectionTargetId, setSelectionTargetId] = useState<string | null>(selectedId);
  const [indicator, setIndicator] = useState<CredentialSelectionState>({ offset: 0, ready: false, targetId: null, visible: false });
  const [editorTransition, setEditorTransition] = useState<{ key: number; kind: EditorTransition }>({ key: 0, kind: "idle" });

  useLayoutEffect(() => {
    const list = listRef.current;
    const target = selectionTargetId && list
      ? [...list.querySelectorAll<HTMLElement>("[data-credential-id]")].find((element) => element.dataset.credentialId === selectionTargetId) ?? null
      : null;
    let animationFrame: number | null = null;
    const measure = () => {
      if (!list || !target) {
        setIndicator((current) => ({ ...current, targetId: selectionTargetId, visible: false }));
        return;
      }
      const offset = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      const ready = indicatorReadyRef.current;
      setIndicator((current) => current.offset === offset && current.ready === ready && current.targetId === selectionTargetId && current.visible
        ? current
        : { offset, ready, targetId: selectionTargetId, visible: true });
      if (!ready) {
        animationFrame = window.requestAnimationFrame(() => {
          indicatorReadyRef.current = true;
          setIndicator((current) => current.targetId === selectionTargetId ? { ...current, ready: true } : current);
        });
      }
    };
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && list && target) {
      observer = new ResizeObserver(measure);
      observer.observe(list);
      observer.observe(target);
    }
    return () => {
      observer?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [items, selectionTargetId]);

  useLayoutEffect(() => {
    if (pendingItemRef.current !== null) return;
    setSelectionTargetId(selectedId);
    editorTargetRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => () => { activeExitRef.current?.cancel(); }, []);

  const cancelExit = useCallback(() => {
    activeExitRef.current?.cancel(); activeExitRef.current = null;
    pendingItemRef.current = null; pendingUpdateRef.current = null;
  }, []);

  const showItem = useCallback((itemId: string, update: () => void) => {
    setSelectionTargetId(itemId);
    const previous = editorTargetRef.current;
    if (previous == null || previous === itemId) {
      cancelExit(); editorTargetRef.current = itemId;
      setEditorTransition((current) => ({ key: current.key + 1, kind: "idle" })); update(); return;
    }
    cancelExit();
    const kind: EditorTransition = items.findIndex((item) => item.id === itemId) < items.findIndex((item) => item.id === previous) ? "switching-up" : "switching-down";
    const stage = stageRef.current;
    if (!stage?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      editorTargetRef.current = itemId; setEditorTransition((current) => ({ key: current.key + 1, kind })); update(); return;
    }
    pendingItemRef.current = itemId; pendingUpdateRef.current = update;
    const animation = stage.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${kind === "switching-down" ? -7 : 7}px)` }], { duration: 90, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    activeExitRef.current = animation;
    void animation.finished.then(() => {
      if (activeExitRef.current !== animation) return;
      const commit = pendingUpdateRef.current; activeExitRef.current = null; pendingItemRef.current = null; pendingUpdateRef.current = null;
      flushSync(() => { editorTargetRef.current = itemId; setEditorTransition((current) => ({ key: current.key + 1, kind })); commit?.(); });
    }).catch(() => undefined);
  }, [cancelExit, items]);

  const showCreate = useCallback((update: () => void) => {
    cancelExit(); editorTargetRef.current = null; setSelectionTargetId(null);
    setEditorTransition((current) => ({ key: current.key + 1, kind: "creating" })); update();
  }, [cancelExit]);

  return { editorTransition, indicator, listRef, selectionTargetId, showCreate, showItem, stageRef };
}
