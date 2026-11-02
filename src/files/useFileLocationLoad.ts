import { useEffect, useRef, type RefObject } from "react";
import { useWorkbenchActive } from "../workspace/workbenchActivity";

/** Restore a directory when its connection or the workbench becomes available. */
export function useFileLocationLoad(
  runtimeKey: string, initialPath: string,
  location: { roots: RefObject<boolean>; runtime: RefObject<string | null>; path: RefObject<string>; inputPath: RefObject<string | null> },
  load: (path: string) => Promise<boolean>,
) {
  const active = useWorkbenchActive();
  const suspended = useRef(false);
  const { roots, runtime, path, inputPath } = location;
  useEffect(() => {
    if (!active) { suspended.current = true; return; }
    const same = !roots.current && runtime.current === runtimeKey
      && (initialPath === path.current || initialPath === inputPath.current);
    if (same && !suspended.current) return;
    suspended.current = false;
    const frame = requestAnimationFrame(() => void load(initialPath));
    return () => cancelAnimationFrame(frame);
  }, [active, initialPath, inputPath, load, path, roots, runtime, runtimeKey]);
}
