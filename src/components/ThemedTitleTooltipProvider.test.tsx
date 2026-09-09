import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemedTitleTooltipProvider } from "./ThemedTitleTooltipProvider";

afterEach(cleanup);

describe("ThemedTitleTooltipProvider", () => {
  it("replaces a native action title with the shared themed tooltip", () => {
    render(<ThemedTitleTooltipProvider><button title="刷新目录">刷新</button></ThemedTitleTooltipProvider>);
    const button = screen.getByRole("button");

    fireEvent.pointerOver(button);
    expect(button).not.toHaveAttribute("title");
    expect(screen.getByRole("tooltip")).toHaveTextContent("刷新目录");
    expect(button).toHaveAccessibleDescription("刷新目录");

    fireEvent.pointerOut(button);
    expect(button).toHaveAttribute("title", "刷新目录");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute("aria-hidden", "true");
  });

  it("only shows matching visible text when it is truncated", () => {
    render(<ThemedTitleTooltipProvider><><span title="完整路径">完整路径</span><span title="很长的文件路径">很长的文件路径</span></></ThemedTitleTooltipProvider>);
    const fitting = screen.getByText("完整路径");
    const truncated = screen.getByText("很长的文件路径");
    Object.defineProperties(fitting, { clientWidth: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 100 } });
    Object.defineProperties(truncated, { clientWidth: { configurable: true, value: 80 }, scrollWidth: { configurable: true, value: 220 } });

    fireEvent.pointerOver(fitting);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.pointerOut(fitting);
    fireEvent.pointerOver(truncated);
    expect(screen.getByRole("tooltip")).toHaveTextContent("很长的文件路径");
  });

  it("shows supplemental titles even when the target fits", () => {
    render(<ThemedTitleTooltipProvider><code title="0123456789abcdef">01234567</code></ThemedTitleTooltipProvider>);
    const oid = screen.getByText("01234567");
    Object.defineProperties(oid, { clientWidth: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 100 } });

    fireEvent.pointerOver(oid);
    expect(screen.getByRole("tooltip")).toHaveTextContent("0123456789abcdef");
  });

  it("supports focus and restores attributes after Escape and blur", () => {
    render(<ThemedTitleTooltipProvider><button aria-describedby="existing-help" title="创建文件">创建</button></ThemedTitleTooltipProvider>);
    const button = screen.getByRole("button");

    fireEvent.focusIn(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("创建文件");
    expect(button.getAttribute("aria-describedby")).toContain("existing-help");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute("aria-hidden", "true");
    expect(button).not.toHaveAttribute("title");
    fireEvent.focusOut(button);
    expect(button).toHaveAttribute("title", "创建文件");
    expect(button).toHaveAttribute("aria-describedby", "existing-help");
  });

  it("dismisses during scrolling without re-enabling the native tooltip under the pointer", () => {
    render(<ThemedTitleTooltipProvider><button title="查看完整状态">状态</button></ThemedTitleTooltipProvider>);
    const button = screen.getByRole("button");

    fireEvent.pointerOver(button);
    fireEvent.scroll(document);
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveAttribute("aria-hidden", "true");
    expect(button).not.toHaveAttribute("title");
    fireEvent.pointerOut(button);
    expect(button).toHaveAttribute("title", "查看完整状态");
  });

  it("removes an action tooltip before a pointer-triggered menu can open", () => {
    render(<ThemedTitleTooltipProvider><button title="上传到当前目录">上传</button></ThemedTitleTooltipProvider>);
    const button = screen.getByRole("button");

    fireEvent.pointerOver(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("上传到当前目录");
    fireEvent.pointerDown(button);
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("title");
  });
});
