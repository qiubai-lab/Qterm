import { dataLease } from "../dataAccess";
export async function saveTerminalImage(blob: Blob): Promise<string | null> {
  dataLease().check();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "qterm-terminal.png";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "qterm-terminal.png";
}
