import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

import { GitChangeComparison } from "./GitChangeComparison";
import {
  buildOverviewMarkers,
  overviewScrollTopForKey,
  overviewScrollTopForPointer,
} from "./gitDiffOverviewModel";

afterEach(cleanup);

describe("GitChangeComparison", () => {
  it("renders two read-only, line-wrapped diff panes without editable active-line or cursor decorations", async () => {
    const view = render(<GitChangeComparison
      before={"before\n"}
      after={"after\n"}
      beforeLabel="HEAD"
      afterLabel="工作区"
      language="text"
    />);

    await waitFor(() => expect(view.container.querySelectorAll(".cm-editor")).toHaveLength(2));
    expect(view.container.querySelectorAll(".cm-content[contenteditable='false']")).toHaveLength(2);
    expect(view.container.querySelectorAll(".cm-lineNumbers")).toHaveLength(2);
    await waitFor(() => expect(Array.from(view.container.querySelectorAll<HTMLElement>(".cm-mergeViewEditor")).every((pane) => pane.style.getPropertyValue("--git-diff-gutter-width") !== "")).toBe(true));
    expect(view.container.querySelectorAll(".cm-lineWrapping")).toHaveLength(2);
    expect(view.container.querySelector(".cm-activeLine")).not.toBeInTheDocument();
    expect(view.container.querySelector(".cm-activeLineGutter")).not.toBeInTheDocument();
    const overview = view.container.querySelector("[role='scrollbar']");
    expect(overview).toHaveAttribute("aria-orientation", "vertical");
    expect(overview).toHaveAttribute("aria-hidden", "true");
  });

  it("wraps one long logical line without adding continuation line numbers", async () => {
    const longLine = `const message = "${"long content ".repeat(8)}";`;
    const view = render(<GitChangeComparison
      before={longLine}
      after={`${longLine} changed`}
      beforeLabel="HEAD"
      afterLabel="工作区"
      language="text"
    />);

    await waitFor(() => expect(view.container.querySelectorAll(".cm-lineWrapping")).toHaveLength(2));
    const editors = Array.from(view.container.querySelectorAll(".cm-editor"));
    expect(editors).toHaveLength(2);
    expect(editors.every((editor) => editor.querySelectorAll(".cm-lineNumbers .cm-gutterElement:not([style*='visibility: hidden'])").length === 1)).toBe(true);
  });

  it("loads the selected language parser into both diff panes", async () => {
    const view = render(<GitChangeComparison
      before={"const beforeValue = 1;\n"}
      after={"const afterValue = 2;\n"}
      beforeLabel="HEAD"
      afterLabel="工作区"
      language="javascript"
    />);

    await waitFor(() => {
      const editors = Array.from(view.container.querySelectorAll<HTMLElement>(".cm-editor"));
      expect(editors).toHaveLength(2);
      expect(editors.every((editor) => {
        const editorView = EditorView.findFromDOM(editor);
        return editorView && syntaxTree(editorView.state).toString().includes("VariableDeclaration");
      })).toBe(true);
    });
  });

  it("maps and coalesces semantic diff ranges into legible overview markers", () => {
    const markers = buildOverviewMarkers([
      { kind: "deletion", from: 20, to: 21 },
      { kind: "deletion", from: 21.5, to: 22 },
      { kind: "addition", from: 50, to: 75 },
      { kind: "deletion", from: 50, to: 70 },
    ], 100, 200);

    expect(markers.filter((marker) => marker.kind === "deletion")).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === "addition")).toHaveLength(1);
    expect(markers.every((marker) => marker.height >= 3)).toBe(true);
    expect(markers.find((marker) => marker.kind === "addition")).toMatchObject({ top: 100, height: 50 });
  });

  it("centers overview pointer navigation and clamps it to the shared scroll range", () => {
    expect(overviewScrollTopForPointer(0, 200, 1000, 200)).toBe(0);
    expect(overviewScrollTopForPointer(100, 200, 1000, 200)).toBe(400);
    expect(overviewScrollTopForPointer(200, 200, 1000, 200)).toBe(800);
  });

  it("maps overview keyboard commands onto the shared vertical scroll range", () => {
    expect(overviewScrollTopForKey("ArrowDown", 100, 800, 200)).toBe(140);
    expect(overviewScrollTopForKey("PageDown", 100, 800, 200)).toBe(280);
    expect(overviewScrollTopForKey("Home", 500, 800, 200)).toBe(0);
    expect(overviewScrollTopForKey("End", 100, 800, 200)).toBe(800);
    expect(overviewScrollTopForKey("Enter", 100, 800, 200)).toBeNull();
  });
});
