import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useWorkspaceTabDeck } from "./useWorkspaceTabDeck";

const ids = ["first", "middle", "last"];
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("reveals a hovered end card as it expands and can reveal the first card again", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function(this: HTMLElement) {
    return this.dataset.testid === "viewport" ? 209 : 300;
  });
  function Harness() {
    const strip = useRef<HTMLDivElement>(null);
    const tabs = useRef(new Map<string, HTMLDivElement>());
    const deck = useWorkspaceTabDeck({ ids, selectedId: "first", lockedId: null, dragging: false, strip, tabs });
    return <div {...deck.events}><div data-testid="viewport" ref={node => {
      strip.current = node;
      if (node) node.scrollTo = vi.fn(options => { if (typeof options === "object") node.scrollLeft = options.left ?? node.scrollLeft; });
    }}>{ids.map(id => <div key={id} className="workspace-tab" data-workspace-id={id} ref={node => { if (node) tabs.current.set(id, node); }}>{id}</div>)}</div></div>;
  }
  render(<Harness/>);
  const viewport = screen.getByTestId("viewport");
  expect(screen.getByText("last").style.getPropertyValue("--workspace-visible-width")).toBe("48px");
  fireEvent.pointerMove(screen.getByText("last"), { clientX: 180, clientY: 15, pointerType: "mouse" });
  await waitFor(() => expect(viewport.scrollLeft).toBe(101));
  expect(screen.getByText("last").style.getPropertyValue("--workspace-visible-width")).toBe("128px");
  // Layout-generated events at the same pointer coordinate must not change the preview.
  fireEvent.pointerMove(screen.getByText("middle"), { clientX: 180, clientY: 15, pointerType: "mouse" });
  expect(viewport.scrollLeft).toBe(101);
  fireEvent.pointerMove(screen.getByText("first"), { clientX: 20, clientY: 15, pointerType: "mouse" });
  await waitFor(() => expect(viewport.scrollLeft).toBe(0));
});
