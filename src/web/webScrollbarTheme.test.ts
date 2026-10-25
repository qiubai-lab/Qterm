// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { webScrollbarTheme } from "./webScrollbarTheme";

afterEach(() => { document.documentElement.removeAttribute("style"); document.getElementById("qterm-native-scrollbars")?.remove(); });

it("uses opaque darker theme hues with progressively stronger interaction colors", () => {
  document.documentElement.style.setProperty("--terminal-scrollbar", "#10203080");
  document.documentElement.style.setProperty("--terminal-scrollbar-hover", "rgb(20, 40, 60)");
  document.documentElement.style.setProperty("--terminal-scrollbar-active", "invalid");
  expect(webScrollbarTheme()).toEqual([[11, 22, 34, 255], [17, 34, 51, 255], [117, 230, 207, 255]]);
  document.documentElement.style.setProperty("--terminal-scrollbar", "#abcdef");
  expect(webScrollbarTheme()[0]).toEqual([120, 144, 167, 255]);
});

it("installs one native-scrollbar stylesheet, updates its palette and reinstalls after document replacement", () => {
  const script = readFileSync("src-tauri/src/infrastructure/web/scrollbar_script.mjs", "utf8");
  const install = new Function(`return (${script})`)();
  install();
  const style = document.getElementById("qterm-native-scrollbars")!;
  expect(style.textContent).toContain("width: 3px");
  expect(style.textContent).toContain("scrollbar-width: auto !important");
  expect(style.textContent).toContain("::-webkit-scrollbar-button");
  install([[1, 2, 3, 255], [4, 5, 6, 255], [7, 8, 9, 255]]);
  expect(document.querySelectorAll("#qterm-native-scrollbars")).toHaveLength(1);
  expect(style.textContent).toContain("rgba(1,2,3,1)");
  style.remove();
  install();
  expect(document.getElementById("qterm-native-scrollbars")).not.toBeNull();
});

it("styles a newly parsed root before DOMContentLoaded, including the next refreshed document", async () => {
  const script = readFileSync("src-tauri/src/infrastructure/web/scrollbar_script.mjs", "utf8");
  const start = new Function("document", `(${script})();`);
  for (let navigation = 0; navigation < 2; navigation++) {
    const page = document.implementation.createHTMLDocument();
    page.documentElement.remove();
    let loaded = false;
    page.addEventListener("DOMContentLoaded", () => { loaded = true; });
    start(page);
    expect(page.getElementById("qterm-native-scrollbars")).toBeNull();
    const root = page.createElement("html");
    page.append(root);
    await Promise.resolve(); // MutationObserver checkpoint before the first paint.
    expect(loaded).toBe(false);
    expect(page.getElementById("qterm-native-scrollbars")?.textContent).toContain("width: 3px");
    root.append(page.createElement("head"), page.createElement("body"));
    page.dispatchEvent(new Event("DOMContentLoaded"));
    expect(page.querySelectorAll("#qterm-native-scrollbars")).toHaveLength(1);
  }
});
