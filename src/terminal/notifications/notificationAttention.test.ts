import { describe, expect, it, vi } from "vitest";
import { createNotificationLimiter, createNotificationReceiver } from "./notificationAttention";
const bytes = (value: string) => new TextEncoder().encode(value);
describe("notification session isolation", () => {
  it("does not combine half an OSC across epochs or blocks", () => {
    const notify = vi.fn(); const receiver = createNotificationReceiver(notify);
    receiver.feed("a", 1, bytes("\x1b]9;old"));
    receiver.feed("b", 1, bytes("\x1b]9;other\x1b\\"));
    receiver.feed("a", 2, bytes("tail\x1b\\"));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("b", 1, { protocol: "osc9", title: "", body: "other" });
    receiver.clear(); receiver.feed("a", 2, bytes("\x1b]9;new\x07"));
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("bounds duplicate and global notification rate without queuing", () => {
    let time = 0; const limiter = createNotificationLimiter(() => time);
    const event = { protocol: "bell" as const, title: "", body: "" };
    expect(limiter.allow("a", 1, event)).toBe(true);
    time = 100; expect(limiter.allow("b", 1, event)).toBe(false);
    time = 2000; expect(limiter.allow("a", 1, event)).toBe(false);
    time = 5000; expect(limiter.allow("a", 1, event)).toBe(true);
    limiter.clear(); expect(limiter.allow("a", 1, event)).toBe(true);
  });
});
