import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemedTooltipButton } from "./ThemedTooltipButton";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("suspends tooltips without disabling the action and waits for a fresh interaction on resume", () => {
  const click = vi.fn();
  const view = render(<ThemedTooltipButton tooltip="提示" onClick={click}>操作</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
  view.rerender(<ThemedTooltipButton tooltip="提示" tooltipDisabled onClick={click}>操作</ThemedTooltipButton>);
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute("tooltipDisabled");
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  view.rerender(<ThemedTooltipButton tooltip="提示" onClick={click}>操作</ThemedTooltipButton>);
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip")).toBeVisible();
});

it("dismisses immediately like the connection hint and starts a fresh entrance on reentry", () => {
  vi.useFakeTimers();
  render(<ThemedTooltipButton aria-label="仓库" tooltip="管理终端目录仓库 /root">Git</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  expect(button).not.toHaveAttribute("title");
  fireEvent.mouseEnter(button);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("管理终端目录仓库 /root");
  expect(button).toHaveAccessibleDescription("管理终端目录仓库 /root");
  fireEvent.mouseLeave(button);
  expect(tooltip).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(80));
  fireEvent.focus(button);
  const reopened = screen.getByRole("tooltip");
  expect(reopened).not.toBe(tooltip);
  expect(reopened).toHaveAttribute("data-overlay-motion", "hover");
  act(() => vi.advanceTimersByTime(160));
  expect(reopened).toBeInTheDocument();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(reopened).not.toBeInTheDocument();
});

it("dismisses on action and keeps the original click behavior", () => {
  const onClick = vi.fn();
  render(<ThemedTooltipButton tooltip="搜索终端输出" onClick={onClick}>搜索</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("places native web toolbar tooltips above the control without leaking placement to the DOM", () => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20);
  render(<ThemedTooltipButton tooltip="访问历史与收藏" tooltipPlacement="above">历史</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 80, 25, 25));
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip")).toHaveStyle({ top: "54px" });
  expect(button).not.toHaveAttribute("tooltipPlacement");
});

it("keeps above-preferred tooltips inside the viewport when the control is near the top", () => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20);
  render(<ThemedTooltipButton tooltip="刷新网页" tooltipPlacement="above">刷新</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 8, 25, 25));
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip")).toHaveStyle({ top: "39px" });
});
