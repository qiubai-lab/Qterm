export async function copyImageUrlToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("浏览器不支持复制图片，请使用保存图片。");
  const blob = await (await fetch(url)).blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
