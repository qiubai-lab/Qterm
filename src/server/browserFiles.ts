import { dataLease } from "./dataAccess";
export function selectBrowserFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement("input"); input.type = "file";
    input.addEventListener("cancel", () => resolve(null), {once:true});
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {once:true});
    input.click();
  });
}
export async function saveBrowserResponse(response: Response, name: string): Promise<void> {
  const lease = dataLease();
  const blob = await response.blob(); lease.check(); const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href=url; link.download=name; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
