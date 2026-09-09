import { describe, expect, it } from "vitest";

import { fitContextMenu } from "./fileBrowserModel";

describe("fitContextMenu", () => {
  it("keeps the menu outside both edges of its anchor row", () => {
    expect(fitContextMenu(390, 51, 180, 120, 400, 400, 16)).toEqual({
      x: 214,
      y: 51,
      placement: "below",
    });
    expect(fitContextMenu(390, 401, 180, 120, 400, 400, 366)).toEqual({
      x: 214,
      y: 246,
      placement: "above",
    });
  });
});
