export async function readText(): Promise<string> {
  if (!navigator.clipboard?.readText) throw new Error("浏览器未开放剪贴板读取，请使用终端中的示例命令。");
  return navigator.clipboard.readText();
}

export async function writeText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("浏览器未开放剪贴板写入。");
  await navigator.clipboard.writeText(text);
}
