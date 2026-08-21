import { useEffect, useState } from "react";

import type { ConnectionRouteProgressState } from "../workspace/connectionProgress";

const SUCCESS_VISIBLE_MS = 1200;

export function ConnectionRouteProgress({ progress }: { progress: ConnectionRouteProgressState | null | undefined }) {
  const [hiddenProgress, setHiddenProgress] = useState<ConnectionRouteProgressState | null>(null);

  useEffect(() => {
    if (progress?.phase !== "connected") return;
    const timer = window.setTimeout(() => setHiddenProgress(progress), SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [progress]);

  if (!progress || hiddenProgress === progress) return null;

  return <div className={`connection-route-progress ${progress.phase}`} role="status" aria-live="polite">
    <div className="connection-route-dots" aria-label={`${progress.completedNodes}/${progress.totalNodes} 个节点已连接`}>
      {Array.from({ length: progress.totalNodes }, (_, index) => {
        const state = index < progress.completedNodes ? "complete" : index === progress.activeNode ? "active" : "pending";
        return <span key={index} className="connection-route-node" data-state={state} aria-label={`节点 ${index + 1}：${nodeStateLabel(state)}`}/>
      })}
    </div>
    <div className="connection-route-message">{progress.message}</div>
  </div>;
}

function nodeStateLabel(state: "complete" | "active" | "pending"): string {
  if (state === "complete") return "已连接";
  if (state === "active") return "连接中";
  return "等待连接";
}
