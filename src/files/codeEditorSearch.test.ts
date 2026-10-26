import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { codeEditorSearch, setCodeEditorSearch } from "./codeEditorSearch";

describe("code editor search", () => {
  afterEach(() => document.body.replaceChildren());

  it("decorates every match and distinguishes the active match", () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "one two one", extensions: [codeEditorSearch] }),
    });

    setCodeEditorSearch(view, [{ from: 0, to: 3 }, { from: 8, to: 11 }], 1);

    expect(view.dom.querySelectorAll(".cm-file-search-match")).toHaveLength(2);
    expect(view.dom.querySelectorAll(".cm-file-search-match-active")).toHaveLength(1);
    view.destroy();
  });

  it("removes stale decorations when the query is cleared", () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: "one", extensions: [codeEditorSearch] }),
    });
    setCodeEditorSearch(view, [{ from: 0, to: 3 }], 0);
    setCodeEditorSearch(view, [], -1);

    expect(view.dom.querySelector(".cm-file-search-match")).not.toBeInTheDocument();
    view.destroy();
  });
});
