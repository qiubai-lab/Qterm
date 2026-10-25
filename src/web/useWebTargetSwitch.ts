import { useEffect, useRef, useState } from "react";
import type { WebNode } from "../workspace/model";

type SelectTarget = (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;

/** Unmount browsing state during teardown; only the latest selection may restore it. */
export function useWebTargetSwitch(workspaceId: string, node: WebNode, selectTarget: SelectTarget) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);

  async function choose(profileId: string | null) {
    if (profileId === node.profileId && !switching) return;
    const request = ++sequence.current;
    setSwitching(true);
    setError("");
    try { await selectTarget(workspaceId, node.blockId, profileId); }
    catch (err) { if (request === sequence.current) setError(String(err)); }
    finally { if (request === sequence.current) setSwitching(false); }
  }
  return { choose, switching, error };
}
