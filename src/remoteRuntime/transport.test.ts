import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { saveNativeDownload } from "./transport";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
it("does not open a save dialog if access was revoked while reading download bytes", async () => {
  const response={arrayBuffer:async()=>new Uint8Array([1,2]).buffer} as Response;
  await expect(saveNativeDownload(response,"配置.json",()=>{throw new Error("locked");})).rejects.toThrow("locked");
  expect(invoke).not.toHaveBeenCalled();
});
