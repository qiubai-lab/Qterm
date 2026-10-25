import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { bootstrapWebCapabilities, nativeWebSupported, usesTunnelAddressMapping } from "./webCapabilities";

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
it("uses backend availability independently of browser user agent", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  vi.mocked(invoke).mockResolvedValue({ local: true, remote: false });
  await bootstrapWebCapabilities();
  expect(nativeWebSupported()).toBe(true);
  expect(nativeWebSupported(true)).toBe(false);
  expect(invoke).toHaveBeenCalledWith("web_supported");
  vi.mocked(invoke).mockResolvedValue({ local: false, remote: false });
  await bootstrapWebCapabilities();
  expect(nativeWebSupported()).toBe(false);
});
it("fails closed when capability discovery fails or is malformed", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  vi.mocked(invoke).mockRejectedValue(new Error("unsupported runtime"));
  await bootstrapWebCapabilities();
  expect(nativeWebSupported()).toBe(false);
  vi.mocked(invoke).mockResolvedValue("true");
  await bootstrapWebCapabilities();
  expect(nativeWebSupported()).toBe(false);
});
it("does not invoke native commands in an ordinary browser", async () => {
  await bootstrapWebCapabilities();
  expect(nativeWebSupported()).toBe(false);
  expect(invoke).not.toHaveBeenCalled();
});

it("enables remote browsers only when the backend explicitly qualifies them", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  vi.mocked(invoke).mockResolvedValue({ local: true, remote: true });
  await bootstrapWebCapabilities();
  expect(nativeWebSupported(true)).toBe(true);
  vi.mocked(invoke).mockResolvedValue({ local: false, remote: true });
  await bootstrapWebCapabilities();
  expect(nativeWebSupported(true)).toBe(false);
});

it("exposes mapping only for a qualified native tunnel and resets it on failure", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  vi.mocked(invoke).mockResolvedValue({ local: true, remote: true, tunnelAddressMapping: true });
  await bootstrapWebCapabilities();
  expect(usesTunnelAddressMapping()).toBe(true);
  vi.mocked(invoke).mockResolvedValue({ local: true, remote: false, tunnelAddressMapping: true });
  await bootstrapWebCapabilities();
  expect(usesTunnelAddressMapping()).toBe(false);
  vi.mocked(invoke).mockRejectedValue(new Error("failed"));
  await bootstrapWebCapabilities();
  expect(usesTunnelAddressMapping()).toBe(false);
});
