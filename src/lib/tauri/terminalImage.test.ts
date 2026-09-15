import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => mocks);
import { saveTerminalImage } from "./terminalImage";

it("sends PNG bytes as raw IPC and preserves native cancellation", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  mocks.invoke.mockResolvedValueOnce(null);
  const blob = { arrayBuffer: async () => bytes.buffer } as Blob;
  expect(await saveTerminalImage(blob)).toBeNull();
  expect(mocks.invoke).toHaveBeenCalledWith("terminal_image_save", bytes);
});
