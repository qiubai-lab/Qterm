import type { WebClipRect } from "../lib/tauri/web";

/** Native child windows sit above CSS. Cut out only overlapping app chrome. */
export function webSurfaceOcclusions(surface: DOMRect): WebClipRect[] {
  const result: WebClipRect[] = [];
  function add(left: number, top: number, right: number, bottom: number) {
    const x = Math.max(left, surface.left), y = Math.max(top, surface.top);
    const width = Math.min(right, surface.right) - x, height = Math.min(bottom, surface.bottom) - y;
    if (width > 0 && height > 0) result.push({ x: x - surface.left, y: y - surface.top, width, height });
  }
  for (const element of document.querySelectorAll<HTMLElement>('[role="tooltip"]')) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || element.closest('[inert]')) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    add(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2);
  }
  return result.slice(0, 64);
}
