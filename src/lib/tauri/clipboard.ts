import { Image as TauriImage } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

function loadBrowserImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解码图片"));
    image.src = url;
  });
}

export async function copyImageUrlToClipboard(url: string) {
  const source = await loadBrowserImage(url);
  const width = source.naturalWidth;
  const height = source.naturalHeight;
  if (width <= 0 || height <= 0) throw new Error("图片尺寸无效");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法读取图片像素");
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const image = await TauriImage.new(rgba, width, height);
  try {
    await writeImage(image);
  } finally {
    await image.close();
  }
}
