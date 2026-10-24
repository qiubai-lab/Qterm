import type { WebLoadState, WebMetrics } from "../lib/tauri/web";
import "./webFeedback.css";

interface Props {
  feedback: string; loading: boolean; ready: boolean; connected: boolean;
  loadState?: WebLoadState; metrics?: WebMetrics | null;
}

/** Persistent app chrome lives outside the native webpage's measured bounds. */
export function WebFeedback({ feedback, loading, ready, connected, loadState, metrics }: Props) {
  const failed = connected && loadState === "failed";
  const resourceCount = ready && metrics ? metrics.resources.toLocaleString() : "0";
  const duration = ready && metrics && metrics.loadMs > 0 && !loading && loadState !== "failed" && loadState !== "stopped"
    ? (metrics.loadMs / 1000).toFixed(2) : "0";
  const message = feedback || (!connected ? "连接后可访问远程网络" : loading ? "正在加载网页…"
    : failed ? "网页加载失败" : loadState === "stopped" ? "已停止加载" : ready ? "已加载" : "等待打开网页");
  return <div className="web-feedback" role={feedback || failed ? "alert" : "status"} aria-live={feedback || failed ? "assertive" : "off"}>
    {connected && <span className="web-feedback-route">SSH 代理 · 独立浏览会话</span>}
    <span className="web-feedback-message" aria-live="polite">{message}</span>
    {connected && <span className="web-feedback-metrics" aria-live="off">
      加载{resourceCount}项资源 · 耗时{duration}秒
    </span>}
  </div>;
}
