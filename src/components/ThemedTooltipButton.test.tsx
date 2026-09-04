import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemedTooltipButton } from "./ThemedTooltipButton";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("replaces native titles with accessible tooltips and retains interrupted exits", () => {
  vi.useFakeTimers();
  render(<ThemedTooltipButton aria-label="仓库" tooltip="管理终端目录仓库 /root">Git</ThemedTooltipButton>);
  const button = screen.getByRole("button");
  expect(button).not.toHaveAttribute("title");
  fireEvent.mouseEnter(button);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("管理终端目录仓库 /root");
  expect(button).toHaveAccessibleDescription("管理终端目录仓库 /root");
  fireEvent.mouseLeave(button);
  expect(tooltip).toHaveAttribute("aria-hidden", "true");
  act(() => vi.advanceTimersByTime(80));
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toBe(tooltip);
  act(() => vi.advanceTimersByTime(160));
  expect(tooltip).toBeInTheDocument();
  fireEvent.keyDown(button, { key: "Escape" });
  act(() => vi.advanceTimersByTime(160));
  expect(tooltip).not.toBeInTheDocument();
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
