import { afterEach, expect, it } from "vitest";
import { webScrollbarTheme } from "./webScrollbarTheme";

afterEach(() => { document.documentElement.removeAttribute("style"); });

it("uses opaque darker theme hues with progressively stronger interaction colors", () => {
  document.documentElement.style.setProperty("--terminal-scrollbar", "#10203080");
  document.documentElement.style.setProperty("--terminal-scrollbar-hover", "rgb(20, 40, 60)");
  document.documentElement.style.setProperty("--terminal-scrollbar-active", "invalid");
  expect(webScrollbarTheme()).toEqual([[11, 22, 34, 255], [17, 34, 51, 255], [117, 230, 207, 255]]);
  document.documentElement.style.setProperty("--terminal-scrollbar", "#abcdef");
  expect(webScrollbarTheme()[0]).toEqual([120, 144, 167, 255]);
});
