// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

const attach = new Function(`return (${readFileSync("src-tauri/src/infrastructure/web/scrollbar_interaction.mjs", "utf8")});`)();
afterEach(() => { vi.useRealTimers(); });

function fixture(axis: "x" | "y" = "y") {
  vi.useFakeTimers();
  const page = new EventTarget();
  const node = document.createElement("div"), hit = document.createElement("div");
  let captured = false;
  hit.setPointerCapture = () => { captured = true; };
  hit.hasPointerCapture = () => captured;
  hit.releasePointerCapture = () => { captured = false; };
  const bar = { node, hit, element: document.createElement("div"), geometry: {
    axis, edge: 500, visibleStart: 0, visibleEnd: 400, root: true, rtl: false, travel: 300, range: 1000, offset: 0,
  } };
  const controller = attach(page, window, new Map([[bar.element, { bars: [bar] }]]), vi.fn());
  controller.attach(bar); controller.start();
  const event = (target: EventTarget, type: string, near = true) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1, pointerType: "mouse", button: 0, relatedTarget: null,
    clientX: axis === "y" ? near ? 493 : 450 : 100,
    clientY: axis === "x" ? near ? 493 : 450 : 100,
  }));
  const move = (near: boolean) => event(page, "pointermove", near);
  const expanded = () => node.hasAttribute("data-active");
  return { page, bar, controller, event, move, expanded };
}

it.each(["x", "y"] as const)("keeps the %s bar expanded for 600ms after leaving without extending the deadline on outside moves", axis => {
  const f = fixture(axis);
  try {
    f.move(true); f.move(false);
    expect(f.expanded()).toBe(true);
    vi.advanceTimersByTime(400); f.move(false);
    vi.advanceTimersByTime(199); expect(f.expanded()).toBe(true);
    vi.advanceTimersByTime(1); expect(f.expanded()).toBe(false);
  } finally { f.controller.stop(); }
});

it("cancels collapse when the pointer returns and starts a fresh grace period on the next exit", () => {
  const f = fixture();
  try {
    f.move(true); f.move(false); vi.advanceTimersByTime(400); f.move(true);
    vi.advanceTimersByTime(1000); expect(f.expanded()).toBe(true);
    f.event(f.page, "pointerout");
    vi.advanceTimersByTime(599); expect(f.expanded()).toBe(true);
    vi.advanceTimersByTime(1); expect(f.expanded()).toBe(false);
  } finally { f.controller.stop(); }
});

it("cancels pending collapse when dragging starts and restores immediately on release", () => {
  const f = fixture();
  try {
    f.move(true); f.move(false); vi.advanceTimersByTime(300);
    f.event(f.bar.hit, "pointerdown");
    vi.advanceTimersByTime(1000); expect(f.expanded()).toBe(true);
    f.event(f.page, "pointerup"); expect(f.expanded()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally { f.controller.stop(); }
});

it("cleans delayed work immediately on blur, element removal and document suspension", () => {
  for (const finish of ["blur", "removed", "stop"]) {
    const f = fixture();
    try {
      f.move(true); f.move(false);
      expect(vi.getTimerCount()).toBe(1);
      if (finish === "blur") window.dispatchEvent(new Event("blur"));
      else if (finish === "removed") f.controller.removed(f.bar);
      else f.controller.stop();
      expect(f.expanded()).toBe(false); expect(vi.getTimerCount()).toBe(0);
    } finally { f.controller.stop(); }
  }
});

it("reveals only viewport scrolling and resets its idle deadline without stealing focus", () => {
  const f = fixture();
  try {
    f.page.dispatchEvent(new Event("scroll"));
    expect(f.bar.node.hasAttribute("data-scrolling")).toBe(true);
    vi.advanceTimersByTime(500); f.page.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(599); expect(f.bar.node.hasAttribute("data-scrolling")).toBe(true);
    vi.advanceTimersByTime(1); expect(f.bar.node.hasAttribute("data-scrolling")).toBe(false);
    f.bar.hit.dispatchEvent(new Event("focus"));
    f.move(false); vi.advanceTimersByTime(1000);
    expect(f.expanded()).toBe(true);
    f.page.dispatchEvent(new Event("scroll")); f.controller.stop();
    expect(f.bar.node.hasAttribute("data-scrolling")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally { f.controller.stop(); }
});
