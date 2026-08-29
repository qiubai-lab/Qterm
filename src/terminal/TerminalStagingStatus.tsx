import { Icon, type IconName } from "../components/Icon";

export type TerminalStagingPhase =
  | "idle"
  | "preparing"
  | "scanning"
  | "uploading"
  | "stopping"
  | "uploaded"
  | "pasted"
  | "cancelled"
  | "failed";

export interface TerminalStagingStatusState {
  phase: TerminalStagingPhase;
  displayName?: string;
  itemCount?: number;
  transferredBytes?: number;
  totalBytes?: number;
  message?: string;
}

export function TerminalStagingStatus({
  state,
  closing,
  canStop,
  onStop,
}: {
  state: TerminalStagingStatusState;
  closing: boolean;
  canStop: boolean;
  onStop: () => void;
}) {
  const presentation = stagingPresentation(state);
  const progress = progressValue(state);
  const cancellable = canStop && (state.phase === "scanning" || state.phase === "uploading");
  return <section
    className="terminal-staging-status"
    data-phase={state.phase}
    data-state={closing ? "closing" : "open"}
    role="status"
    aria-label="终端文件上传状态"
    aria-live="polite"
  >
    <span className="terminal-staging-status-icon">
      <Icon name={presentation.icon} size={10}/>
    </span>
    <span className="terminal-staging-status-copy">
      <strong>{presentation.label}</strong>
      <small title={presentation.summary}>{presentation.summary}</small>
    </span>
    <button
      className="terminal-staging-stop"
      type="button"
      disabled={!cancellable}
      aria-label="停止上传"
      onClick={onStop}
    ><Icon name="close" size={11}/></button>
    <span className="terminal-staging-progress-row">
      <progress
        className="terminal-staging-progress"
        aria-label="上传进度"
        max={100}
        {...(progress === null ? {} : { value: progress })}
      />
      <span className="terminal-staging-metrics">{presentation.metrics}</span>
    </span>
  </section>;
}

function stagingPresentation(state: TerminalStagingStatusState): {
  icon: IconName;
  label: string;
  summary: string;
  metrics: string;
} {
  const itemSummary = state.displayName || (state.itemCount ? `${state.itemCount} 个项目` : "剪贴板文件");
  switch (state.phase) {
    case "preparing":
      return { icon: "upload", label: "准备上传", summary: "正在读取系统剪贴板", metrics: "—" };
    case "scanning":
      return { icon: "search", label: "正在扫描", summary: itemSummary, metrics: itemCount(state) };
    case "uploading":
      return { icon: "upload", label: "正在上传", summary: itemSummary, metrics: byteMetrics(state) };
    case "stopping":
      return { icon: "close", label: "正在停止", summary: itemSummary, metrics: byteMetrics(state) };
    case "uploaded":
      return { icon: "checkCircle", label: "上传成功", summary: itemSummary, metrics: byteMetrics(state) };
    case "pasted":
      return { icon: "checkCircle", label: "路径已粘贴", summary: itemSummary, metrics: byteMetrics(state) };
    case "cancelled":
      return { icon: "close", label: "上传已停止", summary: itemSummary, metrics: byteMetrics(state) };
    case "failed":
      return { icon: "close", label: "上传失败", summary: state.message || "请重试", metrics: byteMetrics(state) };
    case "idle":
      return { icon: "upload", label: "准备上传", summary: "正在读取文件", metrics: "—" };
  }
}

function progressValue(state: TerminalStagingStatusState): number | null {
  if (state.phase === "preparing" || state.phase === "scanning") return null;
  if (state.phase === "uploaded" || state.phase === "pasted") return 100;
  if (!state.totalBytes) return 0;
  return Math.min(100, Math.round(((state.transferredBytes ?? 0) / state.totalBytes) * 100));
}

function itemCount(state: TerminalStagingStatusState): string {
  return state.itemCount ? `${state.itemCount} 项` : "—";
}

function byteMetrics(state: TerminalStagingStatusState): string {
  if (state.totalBytes === undefined) return itemCount(state);
  return `${formatBytes(state.transferredBytes ?? 0)} / ${formatBytes(state.totalBytes)}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}
