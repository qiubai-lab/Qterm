import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useWebTabDeck } from "./useWebTabDeck";

const ids = Array.from({ length: 8 }, (_, index) => `tab-${index}`);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([false, true])("preserves smooth interrupted previews and resize recovery (reduced motion: %s)", reduced => {
  let now = 0, sequence = 0, available = 580;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(44);
  function advance(count = 1) {
    for (let i = 0; i < count; i++) act(() => {
      now += 1000 / 60;
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));
    });
  }
  function Harness() {
    const bar = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null);
    const tabs = useRef(new Map<string, HTMLDivElement>());
    const deck = useWebTabDeck(ids, ids[0], bar, strip, tabs);
    return <div ref={bar} {...deck.events} data-testid="bar" data-stacked={deck.layout.stacked}>
      <div ref={strip} data-testid="strip">{ids.map(id => <div key={id} className="web-tab" data-tab-id={id} data-testid={id} ref={node => { if (node) tabs.current.set(id, node); }}><button role="tab"><span>{id}</span></button></div>)}</div>
    </div>;
  }
  render(<Harness/>);
  const tab = screen.getByTestId(ids[1]);
  const width = () => parseFloat(tab.style.getPropertyValue("--web-deck-width"));
  const original = width(); expect(original).toBeLessThan(112);
  fireEvent.pointerMove(tab, { clientX: 160, clientY: 10, pointerType: "mouse" });
  expect(width()).toBe(original);
  advance(); expect(width()).toBeGreaterThan(original);
  if (!reduced) expect(width()).toBeLessThan(112);
  advance(90); expect(width()).toBe(112);
  fireEvent.pointerLeave(screen.getByTestId("bar")); advance(3);
  const interrupted = width();
  fireEvent.pointerMove(tab, { clientX: 161, clientY: 10, pointerType: "mouse" });
  expect(width()).toBe(interrupted);
  advance(90); expect(width()).toBe(112);
  // A stationary pointer does not switch preview because cards moved underneath it.
  fireEvent.pointerMove(screen.getByTestId(ids[2]), { clientX: 161, clientY: 10, pointerType: "mouse" });
  advance(90); expect(width()).toBe(112);
  screen.getByTestId("strip").scrollLeft = 20;
  fireEvent.pointerLeave(screen.getByTestId("bar")); advance(90); expect(width()).toBe(original);
  expect(screen.getByTestId("strip").scrollLeft).toBe(20);
  available = 1200; fireEvent(window, new Event("resize"));
  expect(screen.getByTestId("bar")).toHaveAttribute("data-stacked", "false");
});
