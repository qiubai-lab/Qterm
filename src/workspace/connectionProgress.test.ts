import { describe, expect, it } from "vitest";

import type { SessionNode } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, failConnectionProgress, initialConnectionProgress } from "./connectionProgress";

const jump: SessionNode = { profileId: "jump-1", name: "Gateway", host: "gateway.test", port: 22, index: 0, total: 2, role: "jump" };
const target: SessionNode = { profileId: "target-1", name: "Server", host: "server.test", port: 22, index: 1, total: 2, role: "target" };
const directTarget: SessionNode = { ...target, index: 0, total: 1 };

describe("connectionProgressFromRouteEvent", () => {
  it("uses one target node for a direct connection", () => {
    expect(initialConnectionProgress(0)).toEqual({
      totalNodes: 1,
      completedNodes: 0,
      activeNode: 0,
      phase: "connecting",
      message: "正在连接节点 1",
      nodes: [
        { index: 0, name: "目标节点", endpoint: null, role: "target", state: "active", stage: "connect" },
      ],
    });

    expect(connectionProgressFromRouteEvent({ type: "routeProgress", node: directTarget, stage: "connect" })).toMatchObject({
      totalNodes: 1,
      completedNodes: 0,
      activeNode: 0,
      nodes: [{ index: 0, name: "Server", role: "target", state: "active" }],
    });
  });

  it("uses one jump and one target node for a single-jump route", () => {
    expect(initialConnectionProgress(1)).toEqual({
      totalNodes: 2,
      completedNodes: 0,
      activeNode: 0,
      phase: "connecting",
      message: "正在连接节点 1",
      nodes: [
        { index: 0, name: "跳板 1", endpoint: null, role: "jump", state: "active", stage: "connect" },
        { index: 1, name: "目标节点", endpoint: null, role: "target", state: "pending", stage: null },
      ],
    });
  });

  it("keeps the current route node active without a synthetic local offset", () => {
    expect(connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "connect" })).toEqual({
      totalNodes: 2,
      completedNodes: 0,
      activeNode: 0,
      phase: "connecting",
      message: "正在连接节点 1 · Gateway",
      nodes: [
        { index: 0, name: "Gateway", endpoint: "gateway.test:22", role: "jump", state: "active", stage: "connect" },
        { index: 1, name: "目标节点", endpoint: null, role: "target", state: "pending", stage: null },
      ],
    });
  });

  it("moves from the completed jump to the target while retaining metadata", () => {
    const connectingJump = connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "authenticate" });
    const openingTarget = connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "openTunnel" }, connectingJump);
    const connectingTarget = connectionProgressFromRouteEvent({ type: "routeProgress", node: target, stage: "connect" }, openingTarget);

    expect(openingTarget).toMatchObject({ totalNodes: 2, completedNodes: 1, activeNode: 1, message: "正在建立节点 2 通道" });
    expect(connectingTarget.nodes[0]).toMatchObject({ name: "Gateway", endpoint: "gateway.test:22", role: "jump", state: "complete", stage: "openTunnel" });
    expect(connectingTarget.nodes[1]).toMatchObject({ name: "Server", endpoint: "server.test:22", role: "target", state: "active", stage: "connect" });
  });

  it("keeps every actual route node complete after connecting", () => {
    const connecting = connectionProgressFromRouteEvent({ type: "routeProgress", node: target, stage: "startSession" });
    const connected = completeConnectionProgress(connecting);

    expect(connecting).toMatchObject({ completedNodes: 1, activeNode: 1, message: "正在启动目标会话 · Server" });
    expect(connected).toMatchObject({ totalNodes: 2, completedNodes: 2, activeNode: null, phase: "connected", message: "连接成功" });
    expect(connected?.nodes.every((node) => node.state === "complete")).toBe(true);
  });

  it("retains the failed node and reason for later inspection", () => {
    const connecting = connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "authenticate" });
    const failed = failConnectionProgress(connecting, jump, "认证失败");

    expect(failed).toMatchObject({ phase: "failed", activeNode: null, message: "认证失败" });
    expect(failed?.nodes[0]).toMatchObject({ name: "Gateway", state: "failed", failureMessage: "认证失败" });
    expect(failed?.nodes[1]).toMatchObject({ state: "pending" });
  });
});
