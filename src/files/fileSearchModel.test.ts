import { describe, expect, it } from "vitest";

import { findFileSearchMatches, moveFileSearchIndex } from "./fileSearchModel";

describe("file search model", () => {
  it("finds literal case-insensitive text without overlapping matches", () => {
    expect(findFileSearchMatches("Qterm qTERM qter", "qterm")).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 11 },
    ]);
    expect(findFileSearchMatches("aaaa", "aa")).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
  });

  it("supports CJK and treats regex punctuation literally", () => {
    expect(findFileSearchMatches("搜索 [a.b]，再次搜索", "搜索")).toEqual([
      { from: 0, to: 2 },
      { from: 11, to: 13 },
    ]);
    expect(findFileSearchMatches("a.b axb", "a.b")).toEqual([{ from: 0, to: 3 }]);
  });

  it("wraps navigation and has no active item for empty results", () => {
    expect(moveFileSearchIndex(0, 3, "previous")).toBe(2);
    expect(moveFileSearchIndex(2, 3, "next")).toBe(0);
    expect(moveFileSearchIndex(0, 0, "next")).toBe(-1);
  });

  it("can bound highlight discovery for unusually dense results", () => {
    expect(findFileSearchMatches("aaaaaa", "a", 3)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
  });
});
