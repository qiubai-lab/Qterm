import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileList, FileSortHeader } from "./FileList";

describe("FileList responsive column markers", () => {
  afterEach(cleanup);

  it("marks collapsible headers and row cells consistently", () => {
    const entry = { name: "long-file-name.txt", path: "/tmp/long-file-name.txt", isDirectory: false, isSymlink: false, size: 12, modifiedAt: 1, permissionMode: 0o644 };
    const noop = vi.fn();

    const view = render(<>
      <FileSortHeader className="file-size-column" label="大小" sortKey="size" sort={null} onChange={noop}/>
      <FileSortHeader className="file-modified-column" label="修改时间" sortKey="modifiedAt" sort={null} onChange={noop}/>
      <FileList entries={[entry]} range={{ start: 0, end: 1 }} ariaLabel="测试文件" selectedPaths={new Set()} onSelect={noop} onOpen={noop} onContextMenu={noop} onContextMenuKey={noop}/>
    </>);

    expect(screen.getByRole("button", { name: /^大小，/ })).toHaveClass("file-size-column");
    expect(screen.getByRole("button", { name: /^修改时间，/ })).toHaveClass("file-modified-column");
    expect(view.container.querySelector(".file-row .file-size-column")).toBeInTheDocument();
    expect(view.container.querySelector(".file-row .file-modified-column")).toBeInTheDocument();
    expect(view.container.querySelector(".file-name>span")).toHaveTextContent("long-file-name.txt");
  });

  it("shows the shared themed tooltip only when the file name is truncated", () => {
    const view = renderFileList();
    const row = screen.getByRole("listitem");
    const name = view.container.querySelector<HTMLElement>(".file-name>span")!;
    Object.defineProperties(name, { clientWidth: { configurable: true, value: 80 }, scrollWidth: { configurable: true, value: 180 } });

    expect(row).not.toHaveAttribute("title");
    fireEvent.mouseEnter(name);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("long-file-name.txt");
    expect(row).toHaveAccessibleDescription("long-file-name.txt");
    fireEvent.mouseLeave(name);
    expect(tooltip).toHaveAttribute("aria-hidden", "true");
    fireEvent.focus(row);
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.keyDown(row, { key: "Escape" });
    expect(tooltip).toHaveAttribute("aria-hidden", "true");
  });

  it("does not show a tooltip for a fully visible file name", () => {
    const view = renderFileList();
    const name = view.container.querySelector<HTMLElement>(".file-name>span")!;
    Object.defineProperties(name, { clientWidth: { configurable: true, value: 180 }, scrollWidth: { configurable: true, value: 180 } });

    fireEvent.mouseEnter(name);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

function renderFileList() {
  const noop = vi.fn();
  return render(<FileList entries={[{ name: "long-file-name.txt", path: "/tmp/long-file-name.txt", isDirectory: false, isSymlink: false, size: 12, modifiedAt: 1, permissionMode: 0o644 }]} range={{ start: 0, end: 1 }} ariaLabel="测试文件" selectedPaths={new Set()} onSelect={noop} onOpen={noop} onContextMenu={noop} onContextMenuKey={noop}/>);
}
