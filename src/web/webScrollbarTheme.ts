import { webFrameColor } from "./webSurfaceFrame";
import type { WebScrollbarTheme } from "../lib/tauri/web";

const fallbacks: WebScrollbarTheme = [[117, 230, 207, 128], [117, 230, 207, 166], [117, 230, 207, 191]];

/** Only numeric color channels cross into the guest; no CSS or executable input. */
export function webScrollbarTheme(root: Element = document.documentElement): WebScrollbarTheme {
  const style = getComputedStyle(root);
  return ["--terminal-scrollbar", "--terminal-scrollbar-hover", "--terminal-scrollbar-active"].map((token, index) => {
    const value = style.getPropertyValue(token).trim();
    let color = webFrameColor(value, 1) ?? fallbacks[index];
    if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) {
      const hex = value.slice(1).padEnd(8, "f");
      color = [0, 2, 4, 6].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as typeof color;
    }
    // Opaque, darker browser thumbs remain clear over white pages as well as dark content.
    const shade = [0.7, 0.85, 1][index];
    return [...color.slice(0, 3).map(channel => Math.round(channel * shade)), 255];
  }) as WebScrollbarTheme;
}
