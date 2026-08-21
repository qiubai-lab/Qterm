import { describe, expect, it } from "vitest";

import type { SessionNode } from "../lib/tauri/sessions";
import { completeConnectionProgress, connectionProgressFromRouteEvent, initialConnectionProgress } from "./connectionProgress";

const jump: SessionNode = { profileId: "jump-1", name: "Gateway", host: "gateway.test", port: 22, index: 0, total: 2, role: "jump" };
const target: SessionNode = { profileId: "target-1", name: "Server", host: "server.test", port: 22, index: 1, total: 2, role: "target" };

describe("connectionProgressFromRouteEvent", () => {
  it("starts with one local, one jump, and one target node pending", () => {
    expect(initialConnectionProgress(1)).toEqual({
      totalNodes: 3,
      completedNodes: 0,
      activeNode: 1,
      phase: "connecting",
      message: "正在连接节点 1",
    });
  });

  it("includes the local device and keeps the current route node active", () => {
    expect(connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "connect" })).toEqual({
      totalNodes: 3,
      completedNodes: 1,
      activeNode: 1,
      phase: "connecting",
      message: "正在连接节点 1 · Gateway",
    });
  });

  it("marks the current node complete while opening the next tunnel", () => {
    expect(connectionProgressFromRouteEvent({ type: "routeProgress", node: jump, stage: "openTunnel" })).toMatchObject({
      totalNodes: 3,
      completedNodes: 2,
      activeNode: 2,
      message: "正在建立节点 2 通道",
    });
  });

  it("keeps the target active until the session reports connected", () => {
    const connecting = connectionProgressFromRouteEvent({ type: "routeProgress", node: target, stage: "startSession" });
    expect(connecting).toMatchObject({ completedNodes: 2, activeNode: 2, message: "正在启动目标会话 · Server" });
    expect(completeConnectionProgress(connecting)).toMatchObject({ completedNodes: 3, activeNode: null, phase: "connected", message: "连接成功" });
  });
});
