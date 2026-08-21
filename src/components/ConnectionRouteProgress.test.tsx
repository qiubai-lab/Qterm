import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionRouteProgress } from "./ConnectionRouteProgress";

describe("ConnectionRouteProgress", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders completed, active, and pending route nodes", () => {
    const { container } = render(<ConnectionRouteProgress progress={{ totalNodes: 3, completedNodes: 1, activeNode: 1, phase: "connecting", message: "正在连接节点 1" }}/>);
    expect(screen.getByRole("status")).toHaveTextContent("正在连接节点 1");
    expect(Array.from(container.querySelectorAll(".connection-route-node")).map((node) => node.getAttribute("data-state"))).toEqual(["complete", "active", "pending"]);
  });

  it("hides the successful route after the confirmation delay", () => {
    vi.useFakeTimers();
    render(<ConnectionRouteProgress progress={{ totalNodes: 3, completedNodes: 3, activeNode: null, phase: "connected", message: "连接成功" }}/>);
    expect(screen.getByRole("status")).toHaveTextContent("连接成功");
    act(() => vi.advanceTimersByTime(1199));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("cancels an old success timer when a new connection starts", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ConnectionRouteProgress progress={{ totalNodes: 2, completedNodes: 2, activeNode: null, phase: "connected", message: "连接成功" }}/>);
    rerender(<ConnectionRouteProgress progress={{ totalNodes: 3, completedNodes: 1, activeNode: 1, phase: "connecting", message: "正在连接节点 1" }}/>);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("status")).toHaveTextContent("正在连接节点 1");
  });
});
