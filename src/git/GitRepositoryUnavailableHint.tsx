import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../components/Icon";

export interface GitRepositoryUnavailableHintState {
  target: HTMLElement;
  message: string;
}

export function GitRepositoryUnavailableHint({ id, hint }: { id: string; hint: GitRepositoryUnavailableHintState | null }) {
  const [, setPositionRevision] = useState(0);

  useEffect(() => {
    if (!hint) return;
    const updatePosition = () => setPositionRevision((revision) => revision + 1);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [hint]);

  if (!hint || !hint.target.isConnected) return null;
  const rect = hint.target.getBoundingClientRect();
  const placement = rect.top >= 64 ? "above" : "below";
  const position = {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)),
    top: placement === "above" ? rect.top - 7 : rect.bottom + 7,
    placement,
  } as const;
  return createPortal(<div id={id} className="git-repository-unavailable-hint" role="tooltip" data-placement={position.placement} style={{ left: position.left, top: position.top } as CSSProperties}><Icon name="help" size={13}/><span>{hint.message}</span></div>, document.body);
}
