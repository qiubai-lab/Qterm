import { describe, expect, it } from "vitest";

import {
  GIT_CHANGE_ROW_HEIGHT,
  gitChangeVirtualRange,
} from "./gitChangeListModel";

describe("git change list virtualization", () => {
  it("keeps a 5,000-item viewport range bounded at the start and end", () => {
    const first = gitChangeVirtualRange({
      count: 5_000,
      listTop: 0,
      viewportTop: 0,
      viewportHeight: GIT_CHANGE_ROW_HEIGHT * 10,
    });
    const last = gitChangeVirtualRange({
      count: 5_000,
      listTop: -(5_000 * GIT_CHANGE_ROW_HEIGHT - GIT_CHANGE_ROW_HEIGHT * 10),
      viewportTop: 0,
      viewportHeight: GIT_CHANGE_ROW_HEIGHT * 10,
    });

    expect(first).toEqual({ start: 0, end: 18 });
    expect(last).toEqual({ start: 4_982, end: 5_000 });
  });

  it("returns an empty range when a virtual group is outside the viewport", () => {
    expect(gitChangeVirtualRange({
      count: 5_000,
      listTop: 400,
      viewportTop: 0,
      viewportHeight: 270,
    })).toEqual({ start: 0, end: 0 });
  });
});
