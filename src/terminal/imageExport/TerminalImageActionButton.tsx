import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import type { TerminalImageFeedback } from "./terminalImageModel";
import { IMAGE_ACTION_CYCLE_MS } from "./useTerminalImageAction";

export function TerminalImageActionButton({ action, available, refreshing = false, operation, feedback, onClick }: {
  action: "copy" | "save"; available: boolean; refreshing?: boolean; operation: "copy" | "save" | null; feedback: TerminalImageFeedback | null; onClick: () => void;
}) {
  const loading = operation === action;
  const success = feedback?.action === action && !feedback.error;
  const state = loading ? "loading" : success ? "success" : "idle";
  const label = action === "save" ? "保存 PNG" : "复制图片";
  return <Button variant={action === "save" ? "secondary" : "primary"} data-available={available || refreshing} data-state={state} disabled={!available || operation !== null} loading={loading} aria-label={loading ? action === "save" ? "正在保存…" : "正在复制…" : label} onClick={onClick}>
    <span className="terminal-image-action-icon" data-loading={loading} aria-hidden="true">
      <span className="terminal-image-action-default"><Icon name={action === "save" ? "download" : "copy"} size={14}/></span>
      <span className="terminal-image-action-ring"><i className="terminal-image-spinner" style={{ animationDuration: `${IMAGE_ACTION_CYCLE_MS}ms` }}/></span>
      <span className="terminal-image-action-check"><Icon name="check" size={10}/></span>
    </span>
    <span>{label}</span>
  </Button>;
}
