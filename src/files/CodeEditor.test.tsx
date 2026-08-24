import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { readClipboardText, writeClipboardText } = vi.hoisted(() => ({
  readClipboardText: vi.fn(),
  writeClipboardText: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: readClipboardText,
  writeText: writeClipboardText,
}));

import { CodeEditor } from "./CodeEditor";

describe("CodeEditor context menu", () => {
  beforeAll(() => {
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) });
  });
  afterEach(() => {
    cleanup();
    readClipboardText.mockReset();
    writeClipboardText.mockReset();
  });

  it("supports select all, copy, cut, and paste in editable files", async () => {
    writeClipboardText.mockResolvedValue(undefined);
    readClipboardText.mockResolvedValue("replacement");
    const onChange = vi.fn();
    const view = render(<CodeEditor value="hello world" language="text" onChange={onChange} onSave={vi.fn()}/>);
    const content = await editorContent(view.container);

    fireEvent.contextMenu(content, { clientX: 80, clientY: 90 });
    let menu = screen.getByRole("menu", { name: "文件编辑菜单" });
    expect(within(menu).getByRole("menuitem", { name: /剪切/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /复制/ })).toBeDisabled();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /全选/ }));

    fireEvent.contextMenu(content, { clientX: 80, clientY: 90 });
    menu = screen.getByRole("menu", { name: "文件编辑菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /复制/ }));
    await waitFor(() => expect(writeClipboardText).toHaveBeenLastCalledWith("hello world"));

    fireEvent.contextMenu(content, { clientX: 80, clientY: 90 });
    fireEvent.click(screen.getByRole("menuitem", { name: /粘贴/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("replacement"));

    fireEvent.contextMenu(content, { clientX: 80, clientY: 90 });
    fireEvent.click(screen.getByRole("menuitem", { name: /全选/ }));
    fireEvent.contextMenu(content, { clientX: 80, clientY: 90 });
    fireEvent.click(screen.getByRole("menuitem", { name: /剪切/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(""));
    expect(writeClipboardText).toHaveBeenLastCalledWith("replacement");
  });

  it("keeps read-only previews non-mutating while allowing copy and select all", async () => {
    writeClipboardText.mockResolvedValue(undefined);
    const view = render(<CodeEditor value="preview text" language="text" readOnly onChange={vi.fn()} onSave={vi.fn()}/>);
    const content = await editorContent(view.container);

    fireEvent.contextMenu(content);
    let menu = screen.getByRole("menu", { name: "文件预览菜单" });
    expect(within(menu).queryByRole("menuitem", { name: /剪切/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /粘贴/ })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /全选/ }));
    fireEvent.contextMenu(content);
    menu = screen.getByRole("menu", { name: "文件预览菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /复制/ }));

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith("preview text"));
  });

  it("opens from the keyboard, supports roving focus, and closes with Escape", async () => {
    readClipboardText.mockResolvedValue("paste");
    const view = render(<CodeEditor value="hello" language="text" onChange={vi.fn()} onSave={vi.fn()}/>);
    const content = await editorContent(view.container);

    fireEvent.keyDown(content, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu", { name: "文件编辑菜单" });
    const paste = within(menu).getByRole("menuitem", { name: /粘贴/ });
    const selectAll = within(menu).getByRole("menuitem", { name: /全选/ });
    await waitFor(() => expect(paste).toHaveFocus());
    fireEvent.keyDown(menu, { key: "End" });
    expect(selectAll).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(paste).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "文件编辑菜单" })).not.toBeInTheDocument();
  });

  it("reports clipboard failures without shifting the editor", async () => {
    writeClipboardText.mockRejectedValue(new Error("剪贴板不可用"));
    const view = render(<CodeEditor value="hello" language="text" onChange={vi.fn()} onSave={vi.fn()}/>);
    const content = await editorContent(view.container);
    fireEvent.contextMenu(content);
    fireEvent.click(screen.getByRole("menuitem", { name: /全选/ }));
    fireEvent.contextMenu(content);
    fireEvent.click(screen.getByRole("menuitem", { name: /复制/ }));

    expect(await screen.findByRole("status", { name: "编辑器操作状态" })).toHaveTextContent("复制失败：剪贴板不可用");
  });
});

async function editorContent(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".cm-content")).toBeInTheDocument());
  return container.querySelector<HTMLElement>(".cm-content")!;
}
