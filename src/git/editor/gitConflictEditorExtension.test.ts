import { describe, expect, it } from "vitest";

import { findGitConflictBlocks, nextGitConflictPosition } from "./gitConflictEditorExtension";

const conflict = [
  "before",
  "<<<<<<< HEAD",
  "current",
  "||||||| base",
  "base",
  "=======",
  "incoming",
  ">>>>>>> main",
  "after",
].join("\n");

describe("Git conflict marker model", () => {
  it("recognizes complete diff3 blocks and their marker lines", () => {
    expect(findGitConflictBlocks(conflict)).toEqual([
      expect.objectContaining({ startLine: 2, baseLine: 4, separatorLine: 6, endLine: 8 }),
    ]);
  });

  it("counts multiple blocks but ignores incomplete or marker-like prose", () => {
    const two = `${conflict}\n${conflict}`;
    expect(findGitConflictBlocks(two)).toHaveLength(2);
    expect(findGitConflictBlocks("documentation mentions <<<<<<< HEAD but has no separator")).toEqual([]);
    expect(findGitConflictBlocks("<<<<<<< HEAD\ncurrent\n=======\nincoming")).toEqual([]);
  });

  it("cycles navigation in both directions", () => {
    const blocks = findGitConflictBlocks(`${conflict}\n${conflict}`);
    expect(nextGitConflictPosition(blocks, blocks[0].from, 1)).toBe(blocks[1].from);
    expect(nextGitConflictPosition(blocks, blocks[1].from, 1)).toBe(blocks[0].from);
    expect(nextGitConflictPosition(blocks, blocks[0].from, -1)).toBe(blocks[1].from);
  });
});
