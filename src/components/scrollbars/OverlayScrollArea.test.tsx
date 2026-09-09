import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayScrollArea } from "./OverlayScrollArea";

const resizeCallbacks: ResizeObserverCallback[] = [];

function setGeometry(element: HTMLElement, geometry: Partial<Record<"clientWidth" | "clientHeight" | "scrollWidth" | "scrollHeight", number>>) {
  for (const [property, value] of Object.entries(geometry)) {
    Object.defineProperty(element, property, { configurable: true, value });
  }
}

function flushResize() {
  act(() => {
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
  });
}

describe("OverlayScrollArea", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resizeCallbacks.length = 0;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the real viewport ref and scroll handler while deriving both overlay thumbs", () => {
    const viewportRef = createRef<HTMLDivElement>();
    const onScroll = vi.fn();
    const view = render(<OverlayScrollArea ref={viewportRef} viewportClassName="feature-scroll" onScroll={onScroll}><div>content</div></OverlayScrollArea>);
    const viewport = view.container.querySelector<HTMLElement>(".feature-scroll")!;
    const root = view.container.querySelector<HTMLElement>(".overlay-scroll-area")!;
    setGeometry(viewport, { clientWidth: 100, clientHeight: 80, scrollWidth: 250, scrollHeight: 320 });
    flushResize();

    expect(viewportRef.current).toBe(viewport);
    expect(root).toHaveAttribute("data-overflow-x", "true");
    expect(root).toHaveAttribute("data-overflow-y", "true");
    expect(root.style.getPropertyValue("--overlay-scrollbar-y-size")).toBe("24px");
    expect(root.style.getPropertyValue("--overlay-scrollbar-x-size")).toBe("38.4px");

    viewport.scrollTop = 120;
    viewport.scrollLeft = 75;
    fireEvent.scroll(viewport);
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(root).toHaveAttribute("data-scrolling", "true");
    expect(root.style.getPropertyValue("--overlay-scrollbar-y-position")).toBe("28px");
    expect(root.style.getPropertyValue("--overlay-scrollbar-x-position")).toBe("30.8px");

    act(() => vi.advanceTimersByTime(1000));
    expect(root).not.toHaveAttribute("data-scrolling");
  });

  it("does not expose an overlay thumb for an axis without overflow", () => {
    const view = render(<OverlayScrollArea viewportClassName="viewport"><div/></OverlayScrollArea>);
    const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
    const root = view.container.querySelector<HTMLElement>(".overlay-scroll-area")!;
    setGeometry(viewport, { clientWidth: 100, clientHeight: 80, scrollWidth: 100, scrollHeight: 80 });
    flushResize();
    expect(root).toHaveAttribute("data-overflow-x", "false");
    expect(root).toHaveAttribute("data-overflow-y", "false");
    expect(view.container.querySelector(".overlay-scrollbar-y")).not.toBeInTheDocument();
  });

  it("uses surface track insets in thumb geometry and exposes compact density", () => {
    const view = render(<OverlayScrollArea density="compact" trackInsets={{ top: 28, right: 3, bottom: 3 }} viewportClassName="viewport"><div/></OverlayScrollArea>);
    const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
    const root = view.container.querySelector<HTMLElement>(".overlay-scroll-area")!;
    setGeometry(viewport, { clientWidth: 100, clientHeight: 100, scrollWidth: 100, scrollHeight: 500 });
    viewport.scrollTop = 200;
    flushResize();

    expect(root).toHaveAttribute("data-density", "compact");
    expect(root.style.getPropertyValue("--overlay-scrollbar-y-position")).toBe("50.5px");
    expect(root.style.getPropertyValue("--overlay-scrollbar-y-size")).toBe("24px");
    expect(root.style.getPropertyValue("--overlay-scrollbar-y-edge")).toBe("3px");

    const thumb = view.container.querySelector<HTMLElement>(".overlay-scrollbar-y .overlay-scrollbar-thumb")!;
    Object.defineProperty(thumb, "setPointerCapture", { configurable: true, value: vi.fn() });
    fireEvent.pointerDown(thumb, { pointerId: 8, clientY: 50, button: 0 });
    fireEvent.pointerMove(thumb, { pointerId: 8, clientY: 72.5 });
    expect(viewport.scrollTop).toBe(400);
  });

  it("reveals near the edge and drags the vertical thumb through the native viewport", () => {
    const view = render(<OverlayScrollArea viewportClassName="viewport"><div/></OverlayScrollArea>);
    const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
    const root = view.container.querySelector<HTMLElement>(".overlay-scroll-area")!;
    setGeometry(viewport, { clientWidth: 100, clientHeight: 100, scrollWidth: 100, scrollHeight: 500 });
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    flushResize();

    fireEvent.pointerMove(root, { clientX: 97, clientY: 50 });
    expect(root).toHaveAttribute("data-edge-y", "true");

    const thumb = view.container.querySelector<HTMLElement>(".overlay-scrollbar-y .overlay-scrollbar-thumb")!;
    Object.defineProperty(thumb, "setPointerCapture", { configurable: true, value: vi.fn() });
    fireEvent.pointerDown(thumb, { pointerId: 7, clientY: 10, button: 0 });
    fireEvent.pointerMove(thumb, { pointerId: 7, clientY: 50 });
    expect(viewport.scrollTop).toBeCloseTo(222.2, 1);
    expect(root).toHaveAttribute("data-dragging", "y");

    fireEvent.pointerUp(thumb, { pointerId: 7 });
    expect(root).not.toHaveAttribute("data-dragging");
  });

  it("keeps overlay chrome outside the accessibility tree", () => {
    const view = render(<OverlayScrollArea viewportClassName="viewport" viewportProps={{ role: "region", "aria-label": "文件" }}><div/></OverlayScrollArea>);
    expect(view.getByRole("region", { name: "文件" })).toHaveClass("viewport");
    expect(view.container.querySelector(".overlay-scrollbars")).toHaveAttribute("aria-hidden", "true");
  });
});
