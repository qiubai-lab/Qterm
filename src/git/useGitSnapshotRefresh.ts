import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { subscribeGitObservation, supportsGitObservation } from "@qterm/services/gitObservation";
import type { GitObservationTarget } from "../lib/contracts/gitObservation";
import type { GitSnapshot } from "../lib/tauri/git";

type Read = () => Promise<GitSnapshot>;
type Options = {
  path: string | null;
  remote: boolean;
  sessionId?: string | null;
  profileId: string | null;
  enabled: boolean;
  busy: boolean;
  refresh: (clear?: boolean, read?: Read) => Promise<boolean>;
};

/** Visibility controls subscriptions; invalidations survive in-flight mutations and reads. */
export function useGitSnapshotRefresh({ path, remote, sessionId, profileId, enabled, busy, refresh }: Options) {
  const latest = useRef({ busy, refresh });
  const flushRef = useRef(() => {});
  useLayoutEffect(() => { latest.current = { busy, refresh }; }, [busy, refresh]);
  const target = useMemo<GitObservationTarget | null>(() => !path ? null : remote
    ? (sessionId && profileId ? { kind: "remote", path, sessionId, profileId } : null)
    : { kind: "local", path }, [path, remote, sessionId, profileId]);

  useEffect(() => {
    if (!enabled || !target) return;
    let disposed = false, running = false, dirty = false;
    let read: Read | undefined, stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const flush = async () => {
      if (disposed || !dirty || running || latest.current.busy || document.visibilityState === "hidden") return;
      dirty = false;
      running = true;
      const loader = read;
      let ok = false;
      try { ok = await latest.current.refresh(Boolean(loader), loader); }
      finally {
        running = false;
        if (!disposed) {
          if (!ok && loader) dirty = true;
          if (dirty) timer = setTimeout(() => void flush(), 1000);
        }
      }
    };
    const schedule = (loader?: Read) => {
      // Focus/timer probes can be coalesced into the current read; server invalidations cannot.
      if (!loader && (running || latest.current.busy)) return;
      read = loader;
      dirty = true;
      clearTimeout(timer);
      void flush();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        stop?.(); stop = undefined;
        clearInterval(interval); interval = undefined;
        clearTimeout(timer); dirty = false;
      } else if (supportsGitObservation) {
        stop ??= subscribeGitObservation(target, schedule);
      } else if (!interval) {
        timer = setTimeout(() => schedule(), 0);
        interval = setInterval(() => schedule(), 15000);
      } else schedule();
    };
    const focus = () => { if (document.visibilityState !== "hidden") schedule(); };
    flushRef.current = () => { void flush(); };
    visibility();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true; stop?.(); clearTimeout(timer); clearInterval(interval);
      flushRef.current = () => {};
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, target]);
  useEffect(() => { if (!busy) flushRef.current(); }, [busy]);
}
