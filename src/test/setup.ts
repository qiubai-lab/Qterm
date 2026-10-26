import "@testing-library/jest-dom/vitest";

// jsdom has no layout engine, but CodeMirror measures text ranges asynchronously.
// Keep these configurable so tests that exercise geometry can supply their own values.
if (typeof Range !== "undefined" && typeof Range.prototype.getClientRects !== "function") {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

if (typeof Range !== "undefined" && typeof Range.prototype.getBoundingClientRect !== "function") {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    writable: true,
    value: () => new DOMRect(),
  });
}
