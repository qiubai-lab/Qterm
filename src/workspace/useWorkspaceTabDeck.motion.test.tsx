import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useWorkspaceTabDeck } from "./useWorkspaceTabDeck";

const ids = Array.from({ length: 8 }, (_, index) => `workspace-${index}`);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([1070, 600])("keeps title motion continuous and bounded at strip width %i", available => {
  let now = 0;
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(available);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(44);
  function advance() {
    act(() => {
      now += 1000 / 60;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(now));
    });
  }
  function Harness() {
    const strip = useRef<HTMLDivElement>(null);
    const tabs = useRef(new Map<string, HTMLDivElement>());
    const deck = useWorkspaceTabDeck({ ids, selectedId: ids[0], lockedId: null, dragging: false, strip, tabs });
    return <div {...deck.events} data-testid="bar"><div ref={strip}>{ids.map(id => <div key={id} data-testid={id} className="workspace-tab" data-workspace-id={id} ref={node => { if (node) tabs.current.set(id, node); }}><span className="workspace-notification-title">{id}</span></div>)}</div></div>;
  }
  render(<Harness/>);
  const tab = screen.getByTestId(ids[1]);
  const width = () => parseFloat(tab.style.getPropertyValue("--workspace-visible-width"));
  const inset = () => parseFloat(tab.style.getPropertyValue("--workspace-title-inset"));
  const initialWidth = width();
  expect(initialWidth).toBeLessThanOrEqual(128);
  expect(inset()).toBe(0);
  fireEvent.pointerMove(tab, { clientX: 140, clientY: 15, pointerType: "mouse" });
  expect(inset()).toBe(0);
  let previous = 0;
  for (let frame = 0; frame < 90; frame++) {
    advance();
    expect(width()).toBeGreaterThanOrEqual(initialWidth - .001);
    expect(inset()).toBeGreaterThanOrEqual(previous - .001);
    expect(inset()).toBeLessThanOrEqual(12);
    if (frame === 0) expect(inset()).toBeLessThan(2);
    previous = inset();
  }
  expect(width()).toBe(128);
  expect(inset()).toBe(12);
  fireEvent.pointerLeave(screen.getByTestId("bar"));
  expect(inset()).toBe(12);
  for (let frame = 0; frame < 3; frame++) advance();
  const interrupted = inset();
  expect(interrupted).toBeGreaterThan(0);
  expect(interrupted).toBeLessThan(12);
  fireEvent.pointerMove(tab, { clientX: 141, clientY: 15, pointerType: "mouse" });
  expect(inset()).toBe(interrupted);
  for (let frame = 0; frame < 90; frame++) advance();
  expect(inset()).toBe(12);
  fireEvent.pointerLeave(screen.getByTestId("bar"));
  previous = inset();
  for (let frame = 0; frame < 90; frame++) {
    advance(); expect(inset()).toBeLessThanOrEqual(previous + .001); previous = inset();
  }
  expect(inset()).toBe(0);
  expect(width()).toBe(initialWidth);
});
