import { IMAGE_HEADER_HEIGHT, type TerminalImageStyle } from "./terminalImageModel";
import type { TerminalImagePalette } from "./terminalImageTheme";

export function drawImageChrome(context: CanvasRenderingContext2D, width: number, style: TerminalImageStyle, palette: TerminalImagePalette) {
  const centerY = IMAGE_HEADER_HEIGHT / 2;
  context.globalAlpha = 0.8;
  context.fillStyle = palette.header;
  context.fillRect(0, 0, width, IMAGE_HEADER_HEIGHT);
  context.globalAlpha = 0.5;
  context.strokeStyle = palette.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, IMAGE_HEADER_HEIGHT - 0.5);
  context.lineTo(width, IMAGE_HEADER_HEIGHT - 0.5);
  context.stroke();
  context.globalAlpha = 1;
  context.font = '500 11px system-ui, sans-serif';
  context.textBaseline = "middle";
  context.fillStyle = palette.muted;
  if (style === "macos") {
    if (width > 240) {
      context.textAlign = "center";
      context.fillText("Terminal", width / 2, centerY);
    }
    ["#ff5f57", "#febc2e", "#28c840"].forEach((color, index) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(17 + index * 16, centerY, 4, 0, Math.PI * 2);
      context.fill();
    });
  } else if (style === "linux") {
    if (width > 170) {
      context.textAlign = "center";
      context.fillText("Terminal", width / 2, centerY);
    }
    context.strokeStyle = palette.muted;
    context.lineWidth = 1.3;
    [centerY - 4, centerY, centerY + 4].forEach(y => { context.beginPath(); context.moveTo(16, y); context.lineTo(27, y); context.stroke(); });
    context.fillStyle = palette.border;
    context.beginPath(); context.arc(width - 20, centerY, 8, 0, Math.PI * 2); context.fill();
    closeMark(context, width - 20, centerY);
  } else {
    if (width > 220) {
      context.fillStyle = palette.background;
      context.beginPath(); context.roundRect(8, 6, Math.min(148, width - 120), IMAGE_HEADER_HEIGHT - 6, [6, 6, 0, 0]); context.fill();
      context.fillStyle = palette.muted;
      context.textAlign = "left";
      context.font = '12px monospace'; context.fillText(">_", 18, centerY + 3);
      context.font = '11px system-ui, sans-serif'; context.fillText("Terminal", 43, centerY + 3);
    }
    context.strokeStyle = palette.muted;
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(width - 93, centerY); context.lineTo(width - 83, centerY); context.stroke();
    context.strokeRect(width - 59, centerY - 4.5, 9, 9);
    closeMark(context, width - 22, centerY);
  }
  context.textAlign = "left";
}

function closeMark(context: CanvasRenderingContext2D, x: number, y: number) {
  context.beginPath();
  context.moveTo(x - 3.5, y - 3.5); context.lineTo(x + 3.5, y + 3.5);
  context.moveTo(x + 3.5, y - 3.5); context.lineTo(x - 3.5, y + 3.5);
  context.stroke();
}
