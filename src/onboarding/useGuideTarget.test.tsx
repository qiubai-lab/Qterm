import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGuideTarget } from "./useGuideTarget";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("frames only visible workspace controls instead of flexible tab-bar space", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const boxes: Record<string, number[]> = {
      "workspace-tab-bar": [80, 0, 1100, 40], "workspace-tab-strip": [80, 4, 240, 32],
      "workspace-tab": [50, 4, 160, 32], "new-workspace-slot": [330, 4, 28, 32],
    };
    const [x, y, width, height] = boxes[this.className] ?? [0, 0, 0, 0];
    return new DOMRect(x, y, width, height);
  });
  function Probe() {
    const rect = useGuideTarget("workspaces");
    return <output aria-label="target">{JSON.stringify(rect)}</output>;
  }
  render(<><nav className="workspace-tab-bar" data-onboarding="workspaces">
    <div className="workspace-tab-strip"><div className="workspace-tab"/></div>
    <div className="new-workspace-slot"/>
  </nav><Probe/></>);
  expect(screen.getByLabelText("target")).toHaveTextContent(JSON.stringify({ left: 80, top: 4, width: 278, height: 32 }));
});
