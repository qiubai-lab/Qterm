import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FilePreviewDocument, type FilePreviewState } from "./FilePreviewDocument";

const basePreview: FilePreviewState = {
  entry: { name: "notes.txt", path: "/tmp/notes.txt", isDirectory: false, isSymlink: false, size: 20, modifiedAt: null, permissionMode: null },
  kind: "text",
  mode: "preview",
  loading: false,
  error: "",
  content: "Qterm line\nsecond qterm",
  original: "Qterm line\nsecond qterm",
  revision: "1",
  imageUrl: "",
};

describe("FilePreviewDocument search", () => {
  beforeAll(() => {
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) });
  });

  afterEach(cleanup);

  it("opens one controlled search UI from Ctrl+F and cycles matches", async () => {
    const view = renderDocument(basePreview);
    await waitFor(() => expect(view.container.querySelector(".cm-content")).toBeInTheDocument());

    fireEvent.keyDown(view.container.querySelector(".cm-content")!, { key: "f", ctrlKey: true });
    const input = screen.getByRole("searchbox", { name: "搜索内容" });
    expect(input).toHaveFocus();
    expect(view.container.querySelector(".cm-panels")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "qterm" } });
    await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument());
    expect(view.container.querySelectorAll(".cm-file-search-match")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("keeps the query across preview/edit mode changes and clears it on close", async () => {
    const view = renderDocument(basePreview);
    await waitFor(() => expect(view.container.querySelector(".cm-content")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "搜索当前文件" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索内容" }), { target: { value: "line" } });
    await waitFor(() => expect(screen.getByText("1/1")).toBeInTheDocument());

    view.rerender(documentNode({ ...basePreview, mode: "edit" }));
    expect(screen.getByRole("searchbox", { name: "搜索内容" })).toHaveValue("line");
    fireEvent.click(screen.getByRole("button", { name: "关闭搜索" }));
    await waitFor(() => expect(screen.queryByRole("search", { name: "搜索当前文件" })).not.toBeInTheDocument());
    expect(view.container.querySelector(".cm-file-search-match")).not.toBeInTheDocument();
  });
});

function renderDocument(preview: FilePreviewState) {
  return render(documentNode(preview));
}

function documentNode(preview: FilePreviewState) {
  return <FilePreviewDocument
    preview={preview}
    displayPath={preview.entry.path}
    dirty={false}
    saving={false}
    operationMessage=""
    onLeave={vi.fn()}
    onEdit={vi.fn()}
    onSave={vi.fn()}
    onContentChange={vi.fn()}
    onImageContextMenu={vi.fn()}
  />;
}
