import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { ConnectionProfile, ProfileGroup } from "../../../lib/tauri/profiles";

type EditorTransition = "idle" | "switching-down" | "switching-up" | "creating";
export type ConnectionSelectionState = { offset: number; ready: boolean; targetId: string | null; visible: boolean };

export function useConnectionManagerMotion({ selectedId, profiles, groups, collapsedGroupIds, ungroupedCollapsed }: {
  selectedId: string | null;
  profiles: ConnectionProfile[];
  groups: ProfileGroup[];
  collapsedGroupIds: Set<string>;
  ungroupedCollapsed: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeExitRef = useRef<Animation | null>(null);
  const pendingProfileRef = useRef<string | null>(null);
  const pendingUpdateRef = useRef<(() => void) | null>(null);
  const editorTargetRef = useRef<string | null | undefined>(undefined);
  const indicatorReadyRef = useRef(false);
  const [selectionTargetId, setSelectionTargetId] = useState<string | null>(selectedId);
  const [indicator, setIndicator] = useState<ConnectionSelectionState>({ offset: 0, ready: false, targetId: null, visible: false });
  const [editorTransition, setEditorTransition] = useState<{ key: number; kind: EditorTransition }>({ key: 0, kind: "idle" });

  useLayoutEffect(() => {
    const list = listRef.current;
    const target = selectionTargetId && list
      ? [...list.querySelectorAll<HTMLElement>("[data-profile-id]")].find((element) => element.dataset.profileId === selectionTargetId && !element.closest("[inert]")) ?? null
      : null;
    let animationFrame: number | null = null;
    const measure = () => {
      if (!list || !target) {
        setIndicator((current) => ({ ...current, targetId: selectionTargetId, visible: false }));
        return;
      }
      const offset = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      const initialized = indicatorReadyRef.current;
      setIndicator((current) => {
        // Layout changes move the same row; only a new selection should glide.
        const ready = initialized && (current.targetId !== selectionTargetId || current.offset === offset);
        return current.offset === offset && current.ready === ready && current.targetId === selectionTargetId && current.visible
          ? current
          : { offset, ready, targetId: selectionTargetId, visible: true };
      });
      if (!initialized) {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
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
      // Another group's height can move the target without resizing the row.
      list.querySelectorAll(".connection-group-section").forEach((group) => observer?.observe(group));
    }
    return () => {
      observer?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [collapsedGroupIds, groups, profiles, selectionTargetId, ungroupedCollapsed]);

  useEffect(() => {
    if (pendingProfileRef.current === null) setSelectionTargetId(selectedId);
  }, [selectedId]);

  useEffect(() => () => {
    activeExitRef.current?.cancel();
  }, []);

  const cancelExit = useCallback(() => {
    activeExitRef.current?.cancel(); activeExitRef.current = null;
    pendingProfileRef.current = null; pendingUpdateRef.current = null;
  }, []);

  const runEditorTransition = useCallback((profileId: string, kind: EditorTransition, update: () => void) => {
    if (pendingProfileRef.current === profileId) { pendingUpdateRef.current = update; return; }
    cancelExit();
    const stage = stageRef.current;
    if (!stage?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      editorTargetRef.current = profileId; setEditorTransition((current) => ({ key: current.key + 1, kind })); update(); return;
    }
    pendingProfileRef.current = profileId; pendingUpdateRef.current = update;
    const animation = stage.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${kind === "switching-down" ? -7 : 7}px)` }], { duration: 90, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    activeExitRef.current = animation;
    void animation.finished.then(() => {
      if (activeExitRef.current !== animation) return;
      const commit = pendingUpdateRef.current; activeExitRef.current = null; pendingProfileRef.current = null; pendingUpdateRef.current = null;
      flushSync(() => { editorTargetRef.current = profileId; setEditorTransition((current) => ({ key: current.key + 1, kind })); commit?.(); });
    }).catch(() => undefined);
  }, [cancelExit]);

  const showProfile = useCallback((profileId: string, update: () => void) => {
    setSelectionTargetId(profileId);
    const previous = editorTargetRef.current;
    if (previous === undefined || previous === profileId) { cancelExit(); editorTargetRef.current = profileId; update(); return; }
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const order = [...profiles.filter((profile) => !profile.groupId || !knownGroupIds.has(profile.groupId)), ...groups.flatMap((group) => profiles.filter((profile) => profile.groupId === group.id))];
    runEditorTransition(profileId, order.findIndex((profile) => profile.id === profileId) < order.findIndex((profile) => profile.id === previous) ? "switching-up" : "switching-down", update);
  }, [cancelExit, groups, profiles, runEditorTransition]);

  const showNewProfile = useCallback((update: () => void) => {
    if (editorTargetRef.current === null) { update(); return; }
    cancelExit(); editorTargetRef.current = null; setSelectionTargetId(null);
    setEditorTransition((current) => ({ key: current.key + 1, kind: "creating" })); update();
  }, [cancelExit]);

  const settleProfile = useCallback((profileId: string) => { editorTargetRef.current = profileId; setSelectionTargetId(profileId); }, []);

  return { editorTransition, indicator, listRef, selectionTargetId, settleProfile, showNewProfile, showProfile, stageRef };
}
