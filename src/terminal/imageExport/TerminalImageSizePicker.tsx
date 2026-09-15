import { ThemedTooltipButton } from "../../components/ThemedTooltipButton";
import type { TerminalImageScale, TerminalImageSnapshot } from "./terminalImageModel";
import { imageSizeDimensions, imageSizes } from "./terminalImageSizes";

export function TerminalImageSizePicker({ snapshot, scale, busy, onChange }: {
  snapshot: TerminalImageSnapshot | null; scale: TerminalImageScale; busy: boolean; onChange: (scale: TerminalImageScale) => void;
}) {
  const dimensions = imageSizeDimensions(snapshot, scale);
  return <div className="terminal-image-size-control">
    <div className="terminal-image-size-shell">
      <span className="terminal-image-size-caption">尺寸</span>
      <div className="terminal-image-sizes" role="group" aria-label="导出图片尺寸">
        {imageSizes.map(item => {
          const allowed = !!imageSizeDimensions(snapshot, item.scale);
          const tooltip = allowed ? `${item.label} · ${item.scale}× 清晰度` : snapshot ? "选中行数较多，此档位超出图片尺寸限制" : "暂无可导出的图片";
          return <ThemedTooltipButton key={item.scale} tooltip={tooltip} aria-label={item.label} aria-pressed={scale === item.scale} aria-disabled={!allowed || busy} disabled={busy} onClick={() => { if (allowed && !busy) onChange(item.scale); }}><span className="terminal-image-size-label">{item.label}</span></ThemedTooltipButton>;
        })}
      </div>
      <span className="terminal-image-pixel-size" aria-label="导出像素尺寸">{dimensions ? `${dimensions.pixelWidth} × ${dimensions.pixelHeight} px` : "—"}</span>
    </div>
  </div>;
}
