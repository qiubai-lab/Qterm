import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRef } from "react";
import { useWorkspaceTabScroll } from "./useWorkspaceTabScroll";

it("updates both overflow directions and pages without changing selection", () => {
  function Harness() {
    const ref = useRef<HTMLDivElement>(null);
    const scroll = useWorkspaceTabScroll(ref, true);
    return <><div ref={ref} data-testid="viewport"/><button disabled={!scroll.left} onClick={() => scroll.move(-1)}>left</button><button disabled={!scroll.right} onClick={() => scroll.move(1)}>right</button></>;
  }
  render(<Harness/>);
  const node = screen.getByTestId("viewport");
  Object.defineProperties(node, { clientWidth: { value: 200 }, scrollWidth: { value: 600 }, scrollTo: { value: vi.fn() } });
  fireEvent.scroll(node);
  expect(screen.getByText("left")).toBeDisabled();
  expect(screen.getByText("right")).toBeEnabled();
  fireEvent.click(screen.getByText("right"));
  expect(node.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 157 }));
  node.scrollLeft = 180;
  fireEvent.scroll(node);
  expect(screen.getByText("left")).toBeEnabled();
  expect(screen.getByText("right")).toBeEnabled();
  node.scrollLeft = 400;
  act(() => node.dispatchEvent(new Event("workspace-tab-layout")));
  expect(screen.getByText("right")).toBeDisabled();
  fireEvent.click(screen.getByText("left"));
  expect(node.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 243 }));
});
