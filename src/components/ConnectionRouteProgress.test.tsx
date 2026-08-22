import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionRouteProgress } from "./ConnectionRouteProgress";
import { calculateConnectionRouteTooltipPosition } from "./connectionRouteTooltipPosition";

const connectingProgress = {
  totalNodes: 2,
  completedNodes: 0,
  activeNode: 0,
  phase: "connecting" as const,
  message: "正在认证节点 1 · Gateway",
  nodes: [
    { index: 0, name: "Gateway", endpoint: "gateway.test:22", role: "jump" as const, state: "active" as const, stage: "authenticate" as const },
    { index: 1, name: "Server", endpoint: "server.test:22", role: "target" as const, state: "pending" as const, stage: null },
  ],
};

describe("ConnectionRouteProgress", () => {
  afterEach(cleanup);

  it("renders actual route nodes without opening a tooltip automatically", () => {
    const { container } = render(<ConnectionRouteProgress progress={connectingProgress}/>);

    expect(screen.getByRole("status")).toHaveTextContent("正在认证节点 1");
    expect(Array.from(container.querySelectorAll(".connection-route-node")).map((node) => node.getAttribute("data-state"))).toEqual(["active", "pending"]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows exactly one node detail on hover or keyboard focus without pinning it", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectionRouteProgress progress={connectingProgress}/>);
    const gateway = screen.getByRole("img", { name: /Gateway：连接中/ });
    const target = screen.getByRole("img", { name: /Server：等待连接/ });

    await user.hover(gateway);
    const tooltip = screen.getByRole("tooltip");
    expect(container).not.toContainElement(tooltip);
    const detail = tooltip.querySelector(".connection-route-tooltip-detail");
    expect(tooltip).toHaveTextContent("Gateway正在认证gateway.test:22");
    expect(detail?.children[0]).toHaveTextContent("正在认证");
    expect(detail?.children[1]).toHaveTextContent("gateway.test:22");
    await user.unhover(gateway);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.click(target);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Server等待连接server.test:22");
    await user.unhover(target);
    target.blur();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("keeps the tooltip inside both horizontal viewport edges", () => {
    const tooltip = { width: 160, height: 38 };
    expect(calculateConnectionRouteTooltipPosition(
      { top: 20, right: 38, bottom: 43, left: 20, width: 18 },
      tooltip,
      { width: 500, height: 300 },
    )).toMatchObject({ left: 8, placement: "below" });
    expect(calculateConnectionRouteTooltipPosition(
      { top: 20, right: 492, bottom: 43, left: 474, width: 18 },
      tooltip,
      { width: 500, height: 300 },
    )).toMatchObject({ left: 332, placement: "below" });
  });

  it("places the tooltip above its node when the lower viewport space is insufficient", () => {
    expect(calculateConnectionRouteTooltipPosition(
      { top: 250, right: 218, bottom: 273, left: 200, width: 18 },
      { width: 160, height: 38 },
      { width: 500, height: 280 },
    )).toEqual({ left: 129, placement: "above", top: 208 });
  });

  it("updates the inspected node stage in the existing tooltip", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConnectionRouteProgress progress={connectingProgress}/>);
    const gateway = screen.getByRole("img", { name: /Gateway：连接中/ });
    await user.hover(gateway);
    const tooltip = screen.getByRole("tooltip");
    const nextProgress = {
      ...connectingProgress,
      message: "正在启动目标会话 · Gateway",
      nodes: connectingProgress.nodes.map((node) => node.index === 0 ? { ...node, stage: "startSession" as const } : node),
    };

    rerender(<ConnectionRouteProgress progress={nextProgress}/>);

    expect(screen.getByRole("tooltip")).toBe(tooltip);
    expect(tooltip).toHaveTextContent("Gateway正在启动会话");
  });

  it("keeps a successful route and places each host address after its connected state", async () => {
    const user = userEvent.setup();
    const successful = {
      ...connectingProgress,
      completedNodes: 2,
      activeNode: null,
      phase: "connected" as const,
      message: "连接成功",
      nodes: connectingProgress.nodes.map((node) => ({ ...node, state: "complete" as const })),
    };

    const { rerender } = render(<ConnectionRouteProgress progress={successful} endpoint="root@127.0.0.1"/>);
    expect(screen.getByRole("status")).toHaveTextContent("连接成功");
    expect(screen.getByText("root@127.0.0.1")).toHaveClass("connection-route-endpoint");

    rerender(<ConnectionRouteProgress progress={successful} endpoint="root@127.0.0.1"/>);
    expect(screen.getAllByRole("img", { name: /已连接/ })).toHaveLength(2);
    expect(screen.getByText("root@127.0.0.1")).toBeInTheDocument();

    await user.hover(screen.getByRole("img", { name: /Server：已连接/ }));
    const detail = screen.getByRole("tooltip").querySelector(".connection-route-tooltip-detail");
    expect(detail?.children[0]).toHaveTextContent("已连接");
    expect(detail?.children[1]).toHaveTextContent("server.test:22");
  });

  it("exposes a retained failed-node reason on hover", async () => {
    const user = userEvent.setup();
    const failed = {
      ...connectingProgress,
      activeNode: null,
      phase: "failed" as const,
      message: "认证失败",
      nodes: connectingProgress.nodes.map((node) => node.index === 0 ? { ...node, state: "failed" as const, failureMessage: "认证失败" } : node),
    };
    render(<ConnectionRouteProgress progress={failed}/>);

    const gateway = screen.getByRole("img", { name: /Gateway：连接失败/ });
    await user.hover(gateway);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Gateway认证失败gateway.test:22");
  });
});
