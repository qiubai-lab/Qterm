import { beforeEach, describe, expect, it, vi } from "vitest";
const http = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../http", async importOriginal => ({ ...await importOriginal<typeof import("../http")>(), api: http.api }));
import { cancelTransfer, downloadFile } from "./transfers";

describe("browser file transfer cancellation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("cancels the server operation as well as the pending HTTP request", async () => {
    let signal: AbortSignal | undefined;
    let transferId: string | undefined;
    http.api.mockImplementation((path: string, _method: string, input: { taskId?: string } | undefined, abort?: AbortSignal) => {
      if (path === "/transfers/download") {
        signal = abort; transferId = input?.taskId;
        return new Promise((_resolve, reject) => abort?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
      }
      return Promise.resolve(null);
    });
    const events = vi.fn();
    const id = await downloadFile("session", "/remote/file", "file", events);
    await cancelTransfer("session", id);
    expect(signal?.aborted).toBe(true);
    expect(http.api).toHaveBeenCalledWith(`/transfers/${transferId}/cancel`, "POST");
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith({ type: "cancelled" }));
    expect(events).not.toHaveBeenCalledWith({ type: "completed" });
  });
});
