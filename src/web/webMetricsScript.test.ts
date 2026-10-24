// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("counts completed resource observations beyond the timing buffer without retaining resource data", () => {
  const script = readFileSync("src-tauri/src/infrastructure/web/metrics_script.mjs", "utf8");
  let report!: (list: { getEntries: () => unknown[] }) => void;
  let queued: unknown[] = [];
  const observe = vi.fn();
  class Observer {
    constructor(callback: typeof report) { report = callback; }
    observe = observe;
    takeRecords() { const records = queued; queued = []; return records; }
  }
  const guest: { top?: unknown; __qtermPageMetrics?: () => unknown } = {};
  guest.top = guest;
  const performance = { timeOrigin: 123, getEntriesByType: () => [{ responseEnd: 1, loadEventEnd: 1234 }] };
  const install = new Function("window", "PerformanceObserver", "performance", "location", script);
  install(guest, Observer, performance, { href: "https://host/" });
  expect(observe).toHaveBeenCalledWith({ type: "resource", buffered: true });
  report({ getEntries: () => Array(300).fill({}) });
  queued = [{}, {}];
  expect(guest.__qtermPageMetrics!()).toEqual({ url: "https://host/", documentId: 123, resources: 303, loadMs: 1234 });
  expect(guest.__qtermPageMetrics!()).toEqual(expect.objectContaining({ resources: 303 }));
  install(guest, Observer, performance, { href: "https://host/" });
  expect(observe).toHaveBeenCalledOnce();
  const second: typeof guest = {};
  second.top = second;
  install(second, Observer, { ...performance, timeOrigin: 456 }, { href: "https://host/" });
  expect(second.__qtermPageMetrics!()).toEqual(expect.objectContaining({ documentId: 456, resources: 1 }));
});
