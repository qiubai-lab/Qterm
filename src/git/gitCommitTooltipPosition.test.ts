import { describe, expect, it } from "vitest";

import { calculateGitCommitTooltipPosition } from "./gitCommitTooltipPosition";

describe("calculateGitCommitTooltipPosition", () => {
  const tooltip = { width: 320, height: 180 };
  const viewport = { width: 1000, height: 700 };

  it("places details beside a narrow graph item when the right side fits", () => {
    expect(calculateGitCommitTooltipPosition(
      { top: 120, right: 430, bottom: 156, left: 20 },
      tooltip,
      viewport,
    )).toEqual({ placement: "right", top: 120, left: 436 });
  });

  it("falls below a wide item and keeps its right edge inside the viewport", () => {
    expect(calculateGitCommitTooltipPosition(
      { top: 120, right: 990, bottom: 156, left: 20 },
      tooltip,
      viewport,
    )).toEqual({ placement: "below", top: 162, left: 670 });
  });

  it("falls above a wide item near the bottom and clamps to the top inset", () => {
    expect(calculateGitCommitTooltipPosition(
      { top: 12, right: 990, bottom: 684, left: 20 },
      { width: 320, height: 690 },
      viewport,
    )).toEqual({ placement: "above", top: 8, left: 670 });
  });
});
