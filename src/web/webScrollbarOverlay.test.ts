// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const read = (name: string) => readFileSync(`src-tauri/src/infrastructure/web/scrollbar_${name}`, "utf8");
const install = new Function("document", "window", `return (${read("overlay.mjs")})(document, window, ${read("geometry.mjs")}, ${read("interaction.mjs")}, ${JSON.stringify(read("overlay.css"))});`);

function fixture() {
  const page = document.implementation.createHTMLDocument();
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const observed = new Set<Element>();
  const guest = Object.assign(new EventTarget(), {
    innerWidth: 800, innerHeight: 500, MutationObserver,
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    ResizeObserver: class { observe(element: Element) { observed.add(element); } unobserve(element: Element) { observed.delete(element); } disconnect() { observed.clear(); } },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    getComputedStyle: (element: HTMLElement) => ({ direction: element.style.direction || "ltr", overflowX: element.style.overflowX || element.style.overflow || "visible", overflowY: element.style.overflowY || element.style.overflow || "visible" }),
  });
  const dimensions = (element: HTMLElement, width: number, height: number, extentX: number, extentY: number) => {
    Object.defineProperties(element, { clientWidth: { value: width, configurable: true }, clientHeight: { value: height, configurable: true }, scrollWidth: { value: extentX, configurable: true }, scrollHeight: { value: extentY, configurable: true }, offsetWidth: { value: width }, offsetHeight: { value: height }, clientTop: { value: 0 }, clientLeft: { value: 0 } });
    element.getBoundingClientRect = () => ({ x: 20, y: 20, left: 20, top: 20, right: 20 + width, bottom: 20 + height, width, height, toJSON() {} });
    element.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options !== "object") return;
      if (options.top !== undefined) element.scrollTop = options.top;
      if (options.left !== undefined) element.scrollLeft = options.left;
    });
  };
  dimensions(page.documentElement, 800, 500, 1600, 2000);
  const controller = install(page, guest);
  const flush = async () => { await Promise.resolve(); const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(0)); await Promise.resolve(); };
  controller.repair(["red", "green", "blue"]);
  const host = () => page.querySelector("qterm-scrollbars") as HTMLElement;
  return { page, guest, frames, dimensions, controller, flush, host, observed };
}

it("enhances dynamically added nested scrollers and keeps them outside page layout", async () => {
  const f = fixture(); await f.flush();
  expect(f.host().parentElement).toBe(f.page.documentElement);
  expect(f.host().shadowRoot!.querySelectorAll(".bar:not([hidden])")).toHaveLength(2);
  const nested = f.page.createElement("div"); nested.style.overflow = "auto";
  f.dimensions(nested, 200, 100, 600, 400); nested.textContent = "content"; f.page.body.append(nested);
  await f.flush(); await f.flush();
  expect(nested.hasAttribute("data-qterm-scroll")).toBe(true);
  expect(f.host().shadowRoot!.querySelectorAll(".bar:not([hidden])")).toHaveLength(4);
  nested.firstChild!.textContent = "dynamic text"; await f.flush();
  nested.remove(); await f.flush();
  expect(f.host().shadowRoot!.querySelectorAll(".bar:not([hidden])")).toHaveLength(2);
  expect(f.observed.has(nested)).toBe(false);
  f.controller.suspend(); expect(f.frames.size).toBe(0); expect(f.observed.size).toBe(0);
});

it("uses a 12px thumb target, never jumps on grab and restores state on cancellation/blur", async () => {
  const f = fixture(); await f.flush();
  const bar = f.host().shadowRoot!.querySelector<HTMLElement>('.bar[data-axis="y"]')!;
  const hit = bar.querySelector<HTMLElement>(".hit")!;
  let captured = false;
  hit.setPointerCapture = () => { captured = true; }; hit.hasPointerCapture = () => captured; hit.releasePointerCapture = () => { captured = false; };
  const pointer = (target: EventTarget, type: string, x: number, y: number) => target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, pointerType: "mouse", button: 0, clientX: x, clientY: y }));
  pointer(f.page, "pointermove", 793, 50); expect(bar.hasAttribute("data-active")).toBe(true);
  pointer(hit, "pointerdown", 793, 50); expect(captured).toBe(true); expect(f.page.documentElement.scrollTop).toBe(0);
  pointer(f.page, "pointermove", 500, 100); expect(f.page.documentElement.scrollTop).toBeGreaterThan(0);
  pointer(f.page, "pointerup", 500, 100); expect(captured).toBe(false); expect(bar.hasAttribute("data-active")).toBe(false);
  for (const finish of [() => pointer(f.page, "pointercancel", 793, 50), () => f.guest.dispatchEvent(new Event("blur"))]) {
    pointer(hit, "pointerdown", 793, 50); finish();
    expect(captured).toBe(false); expect(bar.hasAttribute("data-dragging")).toBe(false);
  }
  f.controller.suspend();
});

it("reinstalls the same overlay after host removal and retains the latest palette on resume", async () => {
  const f = fixture(); await f.flush(); const original = f.host();
  f.controller.suspend(); f.host().remove();
  f.controller.resume(); f.controller.repair(["purple", "pink", "orange"]); await f.flush();
  expect(f.host()).toBe(original); expect(f.host().style.getPropertyValue("--thumb")).toBe("purple");
  expect(f.page.querySelectorAll("qterm-scrollbars")).toHaveLength(1);
  f.controller.suspend();
});
