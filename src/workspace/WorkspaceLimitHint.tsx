import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_WORKSPACES } from "./workspaceLimits";

export function WorkspaceLimitHint({ anchor, id }: { anchor: HTMLElement | null; id: string }) {
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)), top: rect.bottom + 6 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor]);
  return anchor ? createPortal(<div id={id} role="tooltip" className="workspace-limit-hint" style={position}>
    <strong>最多开启 {MAX_WORKSPACES} 个工作区</strong>
    <span>关闭至 {MAX_WORKSPACES} 个以下后即可新建。</span>
  </div>, document.body) : null;
}
