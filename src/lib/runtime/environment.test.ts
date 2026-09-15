import { afterEach, expect, it, vi } from "vitest";
import { hasWorkspaceRuntime, isDemo } from "./environment";

afterEach(() => { Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); vi.restoreAllMocks(); });

it("does not treat an ordinary browser as a desktop host", () => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  expect(hasWorkspaceRuntime()).toBe(isDemo);
  expect("__TAURI_INTERNALS__" in window).toBe(false);
});

it("keeps the native workspace capability available without enabling a fallback", () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  expect(hasWorkspaceRuntime()).toBe(true);
});
