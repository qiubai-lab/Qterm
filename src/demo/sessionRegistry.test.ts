import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDemoSession, getDemoSession, openDemoSession, resetDemoSessions } from "./sessionRegistry";

describe("demo connection lifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { resetDemoSessions(); vi.useRealTimers(); });

  it("returns a session before remote progress and delivers a connected terminal", () => {
    const events = vi.fn(); const output = vi.fn();
    const { sessionId } = openDemoSession(80, 24, output, events, "demo-development");
    expect(getDemoSession(sessionId)).toBeDefined();
    expect(events).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(events).toHaveBeenCalledWith({ type: "stateChanged", state: "connected" });
    expect(output).toHaveBeenCalled();
  });

  it("cancels pending remote connection on close and leaves other sessions alive", () => {
    const events = vi.fn(); const output = vi.fn();
    const first = openDemoSession(80, 24, output, events, "demo-development");
    const second = openDemoSession(80, 24, vi.fn(), vi.fn());
    closeDemoSession(first.sessionId);
    vi.advanceTimersByTime(1000);
    expect(events).toHaveBeenCalledExactlyOnceWith({ type: "stateChanged", state: "closed" });
    expect(output).not.toHaveBeenCalled();
    expect(() => getDemoSession(first.sessionId)).toThrow("已关闭");
    expect(getDemoSession(second.sessionId)).toBeDefined();
  });

  it("reset cleans connecting and streaming sessions without late callbacks", () => {
    const events = vi.fn(); const output = vi.fn();
    const local = openDemoSession(80, 24, output, events);
    vi.advanceTimersByTime(1);
    getDemoSession(local.sessionId).write(new TextEncoder().encode("tail -f logs/app.log\r"));
    openDemoSession(80, 24, output, events, "demo-development");
    resetDemoSessions();
    expect(vi.getTimerCount()).toBe(0);
    const calls = output.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(output).toHaveBeenCalledTimes(calls);
    expect(() => getDemoSession(local.sessionId)).toThrow();
  });

  it("rejects unknown targets rather than connecting a real host", () => {
    expect(() => openDemoSession(80, 24, vi.fn(), vi.fn(), "real-server")).toThrow("不属于演示环境");
    expect(vi.getTimerCount()).toBe(0);
  });
});
