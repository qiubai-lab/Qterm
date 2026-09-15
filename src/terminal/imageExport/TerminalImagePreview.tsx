import { memo } from "react";
import { Icon } from "../../components/Icon";
import { OverlayScrollArea } from "../../components/scrollbars/OverlayScrollArea";
import type { AppTheme } from "../../lib/tauri/settings";
import type { RenderedTerminalImage } from "./renderTerminalImage";
import { imageStyles, imageThemes, type TerminalImageSnapshot, type TerminalImageStyle } from "./terminalImageModel";

// Export feedback must not remeasure or replace the scrollable preview.
export const TerminalImagePreview = memo(function TerminalImagePreview({ image, error, pending, snapshot, style, theme }: {
  image?: RenderedTerminalImage; error?: string; pending: boolean; snapshot: TerminalImageSnapshot | null; style: TerminalImageStyle; theme: AppTheme;
}) {
  return <OverlayScrollArea className="terminal-image-preview-scroll" viewportClassName="terminal-image-preview" viewportProps={{ tabIndex: 0, role: "region", "aria-label": "图片预览", "aria-busy": pending }}>
    {image ? <img className="terminal-image-result" src={image.url} width={image.width} height={image.height} style={{ maxWidth: snapshot?.width }} alt={`终端图片预览，${snapshot?.lines.length} 行，${imageStyles.find(item => item.id === style)?.label} 样式，${imageThemes.find(item => item.id === theme)?.label}主题`}/> : <div className="terminal-image-placeholder" role={error ? "alert" : "status"}><Icon name={error ? "alertCircle" : "terminal"} size={28}/><p>{error || "正在生成预览…"}</p></div>}
  </OverlayScrollArea>;
});
