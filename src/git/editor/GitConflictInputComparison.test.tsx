import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mergeView = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }));

vi.mock("@codemirror/merge", () => ({
  MergeView: class {
    constructor(config: unknown) { mergeView.create(config); }
    destroy() { mergeView.destroy(); }
  },
}));

import type { GitConflictVersion } from "../../lib/tauri/git";
import { GitConflictInputComparison } from "./GitConflictInputComparison";

afterEach(() => {
  cleanup();
  mergeView.create.mockReset();
  mergeView.destroy.mockReset();
});

describe("GitConflictInputComparison", () => {
  it("creates a read-only Incoming-to-Current merge view and destroys it on unmount", () => {
    const incoming: GitConflictVersion = { kind: "text", content: "incoming\n", size: 9, mode: 0o100644 };
    const current: GitConflictVersion = { kind: "text", content: "current\n", size: 8, mode: 0o100644 };
    const view = render(<GitConflictInputComparison incoming={incoming} current={current} language="text"/>);
    expect(mergeView.create).toHaveBeenCalledTimes(1);
    expect(mergeView.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      a: expect.objectContaining({ doc: "incoming\n" }),
      b: expect.objectContaining({ doc: "current\n" }),
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
    }));
    view.unmount();
    expect(mergeView.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses stable version states when the inputs cannot be compared as text", () => {
    const binary: GitConflictVersion = { kind: "binary", content: null, size: 24, mode: 0o100644 };
    const missing: GitConflictVersion = { kind: "missing", content: null, size: 0, mode: null };
    render(<GitConflictInputComparison incoming={binary} current={missing} language="text"/>);
    expect(screen.getByRole("status", { name: "传入版本" })).toHaveTextContent("二进制版本");
    expect(screen.getByRole("status", { name: "当前版本" })).toHaveTextContent("该版本不存在");
    expect(mergeView.create).not.toHaveBeenCalled();
  });
});
