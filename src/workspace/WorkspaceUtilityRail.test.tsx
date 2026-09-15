import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceUtilityRail } from "./WorkspaceUtilityRail";
import { ThemedTitleTooltipProvider } from "../components/ThemedTitleTooltipProvider";

afterEach(cleanup);

it("shows the shared hover tooltip for unavailable demo tools", () => {
  render(<ThemedTitleTooltipProvider><WorkspaceUtilityRail unavailableTitle="暂未开放演示"/></ThemedTitleTooltipProvider>);
  const button = screen.getByRole("button", { name: "关于" });
  fireEvent.pointerOver(button);
  expect(button).toBeDisabled();
  expect(screen.getByRole("tooltip")).toHaveTextContent("暂未开放演示");
  expect(button).toHaveAccessibleDescription("暂未开放演示");
});

it("renders the product tools as display-only buttons without controls", () => {
  render(<WorkspaceUtilityRail unavailableTitle="暂未开放演示"/>);
  expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual([
    "连接管理", "凭证管理", "文件管理", "网络管理", "Git 管理", "打开终端", "锁定终端", "系统设置", "关于",
  ]);
  for (const button of screen.getAllByRole("button")) {
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "暂未开放演示");
  }
});

it("preserves desktop callbacks, active state, disabled lock and update notice", () => {
  const connect = vi.fn();
  render(<WorkspaceUtilityRail controls={{
    connections: { active: true, onClick: connect },
    lock: { disabled: true, accessibleLabel: "先设置凭证", onClick: vi.fn() },
    help: { notice: "发现新版本", onClick: vi.fn() },
  }}/>);
  fireEvent.click(screen.getByRole("button", { name: "连接管理" }));
  expect(connect).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "连接管理" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "先设置凭证" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "关于，发现新版本" })).toHaveClass("update-attention");
});
