import { act, cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./CodeEditor";

afterEach(cleanup);

function setup(value: string, readOnly = false) {
  const onChange = vi.fn();
  let editor!: EditorView;
  render(<>
    <CodeEditor value={value} language="text" readOnly={readOnly} onChange={onChange} onSave={vi.fn()} onViewReady={view => { if (view) editor = view; }}/>
    <button>下一个控件</button>
  </>);
  act(() => editor.focus());
  return { editor, onChange };
}

describe("file editor keyboard input", () => {
  it("inserts a literal tab at the cursor, keeps focus, and supports undo", async () => {
    const user = userEvent.setup();
    const { editor, onChange } = setup("hello");
    act(() => editor.dispatch({ selection: { anchor: 2 } }));

    await user.tab();

    expect(editor.state.doc.toString()).toBe("he\tllo");
    expect(editor.state.selection.main.head).toBe(3);
    expect(editor.contentDOM).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("he\tllo");
    fireEvent.keyDown(editor.contentDOM, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(editor.state.doc.toString()).toBe("hello");
  });

  it("indents selected lines and reverses indentation with Shift+Tab", async () => {
    const user = userEvent.setup();
    const { editor } = setup("one\ntwo");
    act(() => editor.dispatch({ selection: { anchor: 0, head: 7 } }));

    await user.tab();
    expect(editor.state.doc.toString()).toBe("  one\n  two");
    await user.tab({ shift: true });
    expect(editor.state.doc.toString()).toBe("one\ntwo");
    expect(editor.contentDOM).toHaveFocus();
  });

  it("keeps focus when Shift+Tab has no indentation to remove", async () => {
    const user = userEvent.setup();
    const { editor, onChange } = setup("one");
    await user.tab({ shift: true });
    expect(editor.contentDOM).toHaveFocus();
    expect(editor.state.doc.toString()).toBe("one");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves Escape then Tab available for browser focus navigation", () => {
    const { editor, onChange } = setup("one");
    // CodeMirror uses the native keyCode to enable its temporary Tab-focus mode.
    fireEvent.keyDown(editor.contentDOM, { key: "Escape", keyCode: 27 });
    expect(fireEvent.keyDown(editor.contentDOM, { key: "Tab", keyCode: 9 })).toBe(true);
    expect(editor.state.doc.toString()).toBe("one");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not intercept Tab or Shift+Tab in read-only previews", () => {
    const { editor, onChange } = setup("preview", true);
    expect(fireEvent.keyDown(editor.contentDOM, { key: "Tab", keyCode: 9 })).toBe(true);
    expect(fireEvent.keyDown(editor.contentDOM, { key: "Tab", keyCode: 9, shiftKey: true })).toBe(true);
    expect(editor.state.doc.toString()).toBe("preview");
    expect(onChange).not.toHaveBeenCalled();
  });
});
