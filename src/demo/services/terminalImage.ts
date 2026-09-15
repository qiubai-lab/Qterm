export async function saveTerminalImage(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "qterm-demo.png";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "qterm-demo.png";
}
