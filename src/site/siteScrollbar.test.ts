import script from "../../site/public/site-scrollbar.js?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let resize: () => void;
let listeners: Array<[string, EventListenerOrEventListenerObject]>;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="site-main"></main>';
  listeners = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (listener) listeners.push([type, listener]);
    add(type, listener, options);
  });
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(3200);
  vi.spyOn(window, "scrollY", "get").mockReturnValue(1200);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
  });
  new Function(script)();
});
afterEach(() => {
  listeners.forEach(([type, listener]) => window.removeEventListener(type, listener));
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("site-scrollbar-dragging");
});

describe("site overlay scrollbar", () => {
  it("tracks page progress and hides after scroll inactivity, restarting the delay on new scrolls", () => {
    const bar = document.querySelector('[role="scrollbar"]')!;
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).not.toHaveClass("is-scrolling");
    window.dispatchEvent(new Event("scroll"));
    expect(bar).toHaveClass("is-scrolling");
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1000);
    expect(bar).toHaveClass("is-scrolling");
    vi.advanceTimersByTime(100);
    expect(bar).not.toHaveClass("is-scrolling");
  });
  it("supports keyboard navigation without changing the page layout", () => {
    const bar = document.querySelector('[role="scrollbar"]')!;
    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "End", cancelable: true }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: "instant" });
    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    expect(document.querySelector("main")!.style.width).toBe("");
  });
  it("removes the control when content fits and restores it after content grows", () => {
    const bar = document.querySelector('[role="scrollbar"]')!;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(700);
    resize();
    vi.advanceTimersByTime(20);
    expect(bar).toHaveAttribute("hidden");
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(4000);
    resize();
    vi.advanceTimersByTime(20);
    expect(bar).not.toHaveAttribute("hidden");
  });
});
