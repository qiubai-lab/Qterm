import { openUrl } from "@tauri-apps/plugin-opener";

export function isExternalHttpUrl(href: string | undefined): href is string {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function openExternalHttpUrl(href: string): Promise<boolean> {
  if (!isExternalHttpUrl(href)) return false;
  if ("__TAURI_INTERNALS__" in window) await openUrl(href);
  else window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
