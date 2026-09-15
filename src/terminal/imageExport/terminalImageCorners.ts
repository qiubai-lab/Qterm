import { IMAGE_CORNER_RADIUS, IMAGE_SCALE, type TerminalImageScale } from "./terminalImageModel";

export function applyTerminalImageCorners(context: CanvasRenderingContext2D, width: number, height: number, scale: TerminalImageScale = IMAGE_SCALE) {
  const radius = Math.min(IMAGE_CORNER_RADIUS, width / 2, height / 2);
  const corner = document.createElement("canvas");
  corner.width = corner.height = Math.ceil(radius * scale);
  try {
    const mask = corner.getContext("2d");
    if (!mask) throw new Error("无法生成图片圆角");
    const size = corner.width;
    mask.fillRect(0, 0, size, size);
    mask.globalCompositeOperation = "destination-out";
    mask.beginPath();
    mask.arc(size, size, size, 0, Math.PI * 2);
    mask.fill();
    // Rasterize one corner and mirror the same pixels. Independent roundRect
    // corners can have visibly different antialiasing coverage in the WebView.
    for (const [x, y, scaleX, scaleY] of [[0, 0, 1, 1], [width, 0, -1, 1], [0, height, 1, -1], [width, height, -1, -1]]) {
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.translate(x, y);
      context.scale(scaleX, scaleY);
      context.drawImage(corner, 0, 0, radius, radius);
      context.restore();
    }
  } finally {
    corner.width = corner.height = 0;
  }
}
