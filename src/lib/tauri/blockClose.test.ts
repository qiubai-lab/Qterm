import { getCurrentWindow } from "@tauri-apps/api/window";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeNativeBlockClose, subscribeNativeWebTabClose } from "./blockClose";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("native block close subscription", () => {
  it("does not register outside Tauri", () => {
    subscribeNativeBlockClose(vi.fn())();
    expect(getCurrentWindow).not.toHaveBeenCalled();
  });

  it.each([false, true].flatMap(late => [false, true].map(tab => ({ late, tab }))))("cleans up subscription (late: $late, tab: $tab)", async ({ late, tab }) => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    let deliver = (_event: { payload: string | null }) => { void _event; };
    let resolve!: (stop: () => void) => void;
    const stop = vi.fn();
    const listen = vi.fn((_name, callback) => {
      deliver = callback;
      return new Promise<() => void>(done => { resolve = done; });
    });
    vi.mocked(getCurrentWindow).mockReturnValue({ listen } as unknown as ReturnType<typeof getCurrentWindow>);
    const receive = vi.fn();
    const dispose = (tab ? subscribeNativeWebTabClose : subscribeNativeBlockClose)(receive);
    expect(listen).toHaveBeenCalledWith(tab ? "qterm-close-web-tab" : "qterm-close-block", expect.any(Function));
    if (late) dispose();
    resolve(stop);
    await Promise.resolve();
    deliver({ payload: null });
    expect(receive).toHaveBeenCalledTimes(late ? 0 : 1);
    if (!late) expect(receive).toHaveBeenLastCalledWith(null);
    if (!late) dispose();
    deliver({ payload: null });
    expect(receive).toHaveBeenCalledTimes(late ? 0 : 1);
    expect(stop).toHaveBeenCalledOnce();
  });
});
